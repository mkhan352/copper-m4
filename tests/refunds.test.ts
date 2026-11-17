// @vitest-environment node
// Refund rules, the Refund agent's tools and the admin decision. Everything
// runs on the in-memory demo store, so it costs nothing and needs no database.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decideRefund } from "@/lib/copper/admin/decide";
import { decideInConsole } from "@/app/support/actions";
import { decisionNotice } from "@/lib/copper/refunds/events";
import {
  getAutoRefundLimit,
  setAutoRefundLimit,
} from "@/lib/copper/refunds/settings";
import { checkPassword } from "@/lib/copper/admin/session";
import { readInventory } from "@/lib/copper/inventory";
import { createMemoryStore } from "@/lib/copper/refunds/memory-store";
import {
  autoRefundLimitUsd,
  evaluateRefund,
  isAutoApproved,
} from "@/lib/copper/refunds/rules";
import { getStore, resetStore } from "@/lib/copper/refunds/store";
import {
  getPurchaseHistory,
  getRefundRules,
  requestRefund,
} from "@/lib/copper/refunds/tools";
import type { Order } from "@/lib/copper/refunds/types";

// Outside the running app there is no page to refresh.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-17T12:00:00Z");

const order = (over: Partial<Order>): Order => ({
  id: "ORD-X",
  customer_email: "x@example.com",
  kind: "device",
  product: "Copper Home",
  color: "Night Sky",
  sku: "CH-NSK",
  billing: null,
  amount_usd: 149,
  purchased_at: new Date(NOW - 10 * DAY).toISOString(),
  refund_status: "none",
  ...over,
});
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

// The older tests below check the "waits for an admin" path, so they run with
// the auto-refund limit at $0. The auto-refund tests set their own limit.
beforeEach(() => {
  process.env.AUTO_REFUND_LIMIT_USD = "0";
  resetStore(createMemoryStore());
});
afterEach(() => {
  delete process.env.AUTO_REFUND_LIMIT_USD;
});

describe("auto-refund limit", () => {
  const units = async (sku: string) =>
    (await readInventory())!.find((r) => r.sku === sku)!.units_in_stock;

  it("defaults to $100 and can be set with AUTO_REFUND_LIMIT_USD", () => {
    delete process.env.AUTO_REFUND_LIMIT_USD;
    expect(autoRefundLimitUsd()).toBe(100);
    process.env.AUTO_REFUND_LIMIT_USD = "150";
    expect(autoRefundLimitUsd()).toBe(150);
    process.env.AUTO_REFUND_LIMIT_USD = "nonsense";
    expect(autoRefundLimitUsd()).toBe(100);
  });

  it("refunds strictly below the limit are auto-approved, at or above are not", () => {
    process.env.AUTO_REFUND_LIMIT_USD = "100";
    expect(isAutoApproved(79)).toBe(true);
    expect(isAutoApproved(99.99)).toBe(true);
    expect(isAutoApproved(100)).toBe(false);
    expect(isAutoApproved(149)).toBe(false);
  });

  it("get_refund_rules tells the agent whether it is auto-approved", async () => {
    process.env.AUTO_REFUND_LIMIT_USD = "100";
    expect(await getRefundRules("cara@example.com", "ORD-1003")).toMatchObject({
      eligible: true,
      autoApproved: true,
      autoRefundLimitUsd: 100,
    });
    expect(await getRefundRules("ava@example.com", "ORD-1001")).toMatchObject({
      eligible: true,
      autoApproved: false,
    });
    expect(await getRefundRules("ben@example.com", "ORD-1002")).toMatchObject({
      eligible: false,
      autoApproved: false,
    });
  });

  it("a small refund is approved on the spot, with no admin", async () => {
    process.env.AUTO_REFUND_LIMIT_USD = "100";
    const result = await requestRefund(
      "cara@example.com",
      "ORD-1003",
      "Not for me",
    );
    expect(result).toMatchObject({
      status: "auto_approved",
      refundUsd: 79,
      restocked: false,
    });
    expect((await getStore().listRequests())[0]).toMatchObject({
      order_id: "ORD-1003",
      status: "approved",
    });
    expect((await getStore().getOrder("ORD-1003"))?.refund_status).toBe(
      "refunded",
    );
  });

  it("a small device refund restocks the device automatically", async () => {
    process.env.AUTO_REFUND_LIMIT_USD = "200";
    const before = await units("CH-POL");
    const result = await requestRefund(
      "ava@example.com",
      "ORD-1001",
      "Too big",
    );
    expect(result).toMatchObject({ status: "auto_approved", restocked: true });
    expect(await units("CH-POL")).toBe(before + 1);
  });

  it("a refund over the limit still waits for an admin and leaves stock alone", async () => {
    process.env.AUTO_REFUND_LIMIT_USD = "100";
    const before = await units("CH-POL");
    const result = await requestRefund(
      "ava@example.com",
      "ORD-1001",
      "Too big",
    );
    expect(result).toMatchObject({ status: "created" });
    expect((await getStore().listRequests())[0].status).toBe("pending");
    expect(await units("CH-POL")).toBe(before);
  });

  it("an ineligible order is never auto-approved, however small", async () => {
    process.env.AUTO_REFUND_LIMIT_USD = "1000";
    expect(
      await requestRefund("eve@example.com", "ORD-1005", "x"),
    ).toMatchObject({
      status: "not_eligible",
    });
  });

  it("the Refund agent's instructions cover both outcomes", async () => {
    const { REFUND_INSTRUCTIONS } =
      await import("@/lib/copper/refunds/instructions");
    expect(REFUND_INSTRUCTIONS).toContain("auto_approved");
    expect(REFUND_INSTRUCTIONS).toContain('"created"');
    expect(REFUND_INSTRUCTIONS).toMatch(/NEVER say it is approved/);
  });
});

describe("refund rules", () => {
  it("devices: day 30 is inside the window, day 31 is not", () => {
    expect(evaluateRefund(order({ purchased_at: ago(30) }), NOW).eligible).toBe(
      true,
    );
    expect(evaluateRefund(order({ purchased_at: ago(31) }), NOW).eligible).toBe(
      false,
    );
  });

  it("annual Plus: day 14 yes, day 15 no", () => {
    const annual = {
      kind: "plan" as const,
      billing: "annual" as const,
      sku: null,
    };
    expect(
      evaluateRefund(order({ ...annual, purchased_at: ago(14) }), NOW).eligible,
    ).toBe(true);
    expect(
      evaluateRefund(order({ ...annual, purchased_at: ago(15) }), NOW).eligible,
    ).toBe(false);
  });

  it("monthly Plus is never refunded for a partial month", () => {
    const monthly = order({
      kind: "plan",
      billing: "monthly",
      sku: null,
      purchased_at: ago(1),
    });
    const result = evaluateRefund(monthly, NOW);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/partial months/i);
  });

  it("an order with a pending or finished refund can't be asked about again", () => {
    expect(
      evaluateRefund(order({ refund_status: "pending" }), NOW).eligible,
    ).toBe(false);
    expect(
      evaluateRefund(order({ refund_status: "refunded" }), NOW).eligible,
    ).toBe(false);
  });

  it("the refund is the order's price when eligible", () => {
    expect(evaluateRefund(order({}), NOW).refundUsd).toBe(149);
  });
});

describe("Refund agent tools", () => {
  it("get_purchase_history only returns the signed-in customer's orders", async () => {
    const result = await getPurchaseHistory("ava@example.com");
    expect(result).toMatchObject({ status: "ok" });
    if (result.status !== "ok") return;
    expect(result.orders.map((o) => o.orderId)).toEqual(["ORD-1001"]);
    expect(await getPurchaseHistory(undefined)).toEqual({
      status: "need_email",
    });
  });

  it("get_refund_rules answers per order and hides other customers' orders", async () => {
    expect(await getRefundRules("ava@example.com", "ORD-1001")).toMatchObject({
      status: "ok",
      eligible: true,
    });
    expect(await getRefundRules("ben@example.com", "ORD-1002")).toMatchObject({
      status: "ok",
      eligible: false,
    });
    expect(await getRefundRules("ava@example.com", "ORD-1002")).toEqual({
      status: "not_found",
    });
  });

  it("request_refund files a pending request for an eligible order", async () => {
    const result = await requestRefund(
      "ava@example.com",
      "ORD-1001",
      "Too big",
    );
    expect(result).toMatchObject({ status: "created", refundUsd: 149 });
    const [first] = await getStore().listRequests();
    expect(first).toMatchObject({
      order_id: "ORD-1001",
      status: "pending",
      reason: "Too big",
    });
    expect((await getStore().getOrder("ORD-1001"))?.refund_status).toBe(
      "pending",
    );
  });

  it("request_refund refuses ineligible, duplicate and other customers' orders", async () => {
    expect(
      await requestRefund("ben@example.com", "ORD-1002", "x"),
    ).toMatchObject({
      status: "not_eligible",
    });
    expect(
      await requestRefund("eve@example.com", "ORD-1005", "x"),
    ).toMatchObject({
      status: "not_eligible",
    });
    // A second request for the same order is refused (duplicate).
    expect(
      await requestRefund("finn@example.com", "ORD-1006", "first"),
    ).toMatchObject({ status: "created" });
    expect(
      await requestRefund("finn@example.com", "ORD-1006", "again"),
    ).toMatchObject({ status: "not_eligible" });
    expect(await requestRefund("ben@example.com", "ORD-1001", "x")).toEqual({
      status: "not_found",
    });
    expect(await requestRefund(undefined, "ORD-1001", "x")).toEqual({
      status: "need_email",
    });
  });

  it("never approves anything itself, and never touches stock", async () => {
    const before = await readInventory();
    await requestRefund("ava@example.com", "ORD-1001", "Too big");
    expect((await getStore().listRequests())[0].status).toBe("pending");
    expect(await readInventory()).toEqual(before);
  });
});

describe("admin decisions", () => {
  const units = async (sku: string) =>
    (await readInventory())!.find((r) => r.sku === sku)!.units_in_stock;

  it("approving a device refund puts the device back in stock after approval, not before", async () => {
    const before = await units("CH-POL");
    await requestRefund("ava@example.com", "ORD-1001", "Too big");
    expect(await units("CH-POL")).toBe(before);
    const [request] = await getStore().listRequests();
    expect(await decideRefund(request.id, "approved", null)).toEqual({
      status: "approved",
      restocked: true,
    });
    expect(await units("CH-POL")).toBe(before + 1);
    expect((await getStore().getOrder("ORD-1001"))?.refund_status).toBe(
      "refunded",
    );
  });

  it("approving a plan refund doesn't touch stock", async () => {
    const all = (await readInventory())!.map((r) => r.units_in_stock);
    await requestRefund("cara@example.com", "ORD-1003", "Not for me");
    const [request] = await getStore().listRequests();
    expect(await decideRefund(request.id, "approved", null)).toEqual({
      status: "approved",
      restocked: false,
    });
    expect((await readInventory())!.map((r) => r.units_in_stock)).toEqual(all);
  });

  it("rejecting records the note, frees the order and leaves stock alone", async () => {
    const before = await units("CH-POL");
    await requestRefund("ava@example.com", "ORD-1001", "Too big");
    const [request] = await getStore().listRequests();
    expect(await decideRefund(request.id, "rejected", "Looks used")).toEqual({
      status: "rejected",
    });
    expect((await getStore().listRequests())[0]).toMatchObject({
      status: "rejected",
      admin_note: "Looks used",
    });
    expect((await getStore().getOrder("ORD-1001"))?.refund_status).toBe("none");
    expect(await units("CH-POL")).toBe(before);
  });

  it("a request can be decided only once", async () => {
    await requestRefund("finn@example.com", "ORD-1006", "Too big");
    const [request] = await getStore().listRequests();
    await decideRefund(request.id, "approved", null);
    const stock = await units("CH-NSK");
    expect(await decideRefund(request.id, "approved", null)).toEqual({
      status: "already_decided",
    });
    expect(await decideRefund(request.id, "rejected", null)).toEqual({
      status: "already_decided",
    });
    expect(await units("CH-NSK")).toBe(stock);
  });
});

describe("changeable limit and the Support page's actions", () => {
  it("the limit an admin saves wins over the default, for the rules and the agent", async () => {
    delete process.env.AUTO_REFUND_LIMIT_USD;
    expect(await getAutoRefundLimit()).toBe(100);
    expect(await setAutoRefundLimit(200)).toBe(true);
    expect(await getAutoRefundLimit()).toBe(200);
    // Ava's $149 refund is now automatic.
    expect(
      await requestRefund("ava@example.com", "ORD-1001", "Too big"),
    ).toMatchObject({ status: "auto_approved" });
    // And a limit of $0 makes everything wait for an admin.
    expect(await setAutoRefundLimit(0)).toBe(true);
    expect(
      await requestRefund("cara@example.com", "ORD-1003", "No thanks"),
    ).toMatchObject({ status: "created" });
  });

  it("refuses limits that aren't a dollar amount", async () => {
    expect(await setAutoRefundLimit(-5)).toBe(false);
    expect(await setAutoRefundLimit(Number.NaN)).toBe(false);
    expect(await getAutoRefundLimit()).toBe(autoRefundLimitUsd());
  });

  it("approve and reject from the console return what the chat should tell the customer", async () => {
    delete process.env.AUTO_REFUND_LIMIT_USD;
    await requestRefund("ava@example.com", "ORD-1001", "Too big");
    await requestRefund("finn@example.com", "ORD-1006", "Changed my mind");
    const pending = await getStore().listRequests();
    const ava = pending.find((r) => r.customer_email === "ava@example.com")!;
    const finn = pending.find((r) => r.customer_email === "finn@example.com")!;

    const approved = await decideInConsole(ava.id, "approved");
    expect(approved.result).toMatchObject({ status: "approved" });
    expect(approved.detail).toMatchObject({
      email: "ava@example.com",
      status: "approved",
      amountUsd: 149,
    });
    expect(decisionNotice(approved.detail!)).toMatch(/approved/);

    const rejected = await decideInConsole(finn.id, "rejected");
    expect(rejected.detail?.status).toBe("rejected");
    expect(decisionNotice(rejected.detail!)).toMatch(
      /did not approve it[\s\S]*not refunded/,
    );
    expect((await getStore().getOrder("ORD-1006"))?.refund_status).toBe("none");
    expect((await decideInConsole(finn.id, "rejected")).detail).toBeUndefined();
  });
});

describe("admin password", () => {
  it("accepts only the configured password", () => {
    process.env.ADMIN_PASSWORD = "open-sesame";
    expect(checkPassword("open-sesame")).toBe(true);
    expect(checkPassword("nope")).toBe(false);
    delete process.env.ADMIN_PASSWORD;
    expect(checkPassword("")).toBe(false);
  });
});

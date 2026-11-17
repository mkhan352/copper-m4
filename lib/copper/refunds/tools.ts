// The Refund agent's tools. The customer's email is fixed by the server when
// the tools are made (makeRefundTools), never chosen by the model, so the
// agent can only ever see and refund the signed-in demo customer's own orders.
// update_availability is NOT a model tool: it runs only when an admin approves
// a refund (lib/copper/refunds/availability.ts).
import { tool } from "ai";
import { z } from "zod";
import { decideRefund } from "@/lib/copper/admin/decide";
import { daysSince, evaluateRefund } from "@/lib/copper/refunds/rules";
import { getStore } from "@/lib/copper/refunds/store";
import type { Order } from "@/lib/copper/refunds/types";

export type PurchaseHistory =
  | { status: "need_email" }
  | { status: "unavailable"; message: string }
  | {
      status: "ok";
      orders: {
        orderId: string;
        product: string;
        color: string | null;
        billing: Order["billing"];
        amountUsd: number;
        purchasedAt: string;
        daysSincePurchase: number;
        refundStatus: Order["refund_status"];
      }[];
    };

export type RefundRequestResult =
  | { status: "created"; requestId: string; refundUsd: number }
  | {
      status: "auto_approved";
      requestId: string;
      refundUsd: number;
      restocked: boolean;
    }
  | { status: "not_eligible"; reason: string }
  | { status: "not_found" }
  | { status: "need_email" }
  | { status: "unavailable"; message: string };

export type RefundRulesResult =
  | ({ status: "ok" } & ReturnType<typeof evaluateRefund>)
  | { status: "not_found" }
  | { status: "need_email" }
  | { status: "unavailable"; message: string };

export type Handoff = { handoff: "copper" | "refund"; summary: string };

const UNAVAILABLE = {
  status: "unavailable" as const,
  message: "Orders can't be looked up right now. Please try again soon.",
};

/** The order, only if it belongs to this customer. */
async function ownOrder(email: string, orderId: string) {
  const order = await getStore().getOrder(orderId.trim().toUpperCase());
  return order && order.customer_email === email.toLowerCase() ? order : null;
}

export async function getPurchaseHistory(
  email: string | undefined,
): Promise<PurchaseHistory> {
  if (!email) return { status: "need_email" };
  try {
    const orders = await getStore().listOrders(email);
    return {
      status: "ok",
      orders: orders.map((o) => ({
        orderId: o.id,
        product: o.product,
        color: o.color,
        billing: o.billing,
        amountUsd: o.amount_usd,
        purchasedAt: o.purchased_at,
        daysSincePurchase: daysSince(o.purchased_at),
        refundStatus: o.refund_status,
      })),
    };
  } catch {
    return UNAVAILABLE;
  }
}

export async function getRefundRules(
  email: string | undefined,
  orderId: string,
): Promise<RefundRulesResult> {
  if (!email) return { status: "need_email" };
  try {
    const order = await ownOrder(email, orderId);
    if (!order) return { status: "not_found" };
    return { status: "ok", ...evaluateRefund(order) };
  } catch {
    return UNAVAILABLE;
  }
}

export async function requestRefund(
  email: string | undefined,
  orderId: string,
  reason: string,
): Promise<RefundRequestResult> {
  if (!email) return { status: "need_email" };
  try {
    const order = await ownOrder(email, orderId);
    if (!order) return { status: "not_found" };
    // Checked again here, so no wording from the model can skip the rules.
    const decision = evaluateRefund(order);
    if (!decision.eligible)
      return { status: "not_eligible", reason: decision.reason };
    const request = await getStore().createRequest({
      order_id: order.id,
      customer_email: order.customer_email,
      kind: order.kind,
      product: order.product,
      sku: order.sku,
      reason: reason.trim(),
      agent_summary: decision.reason,
      amount_usd: decision.refundUsd,
      rule_applied: decision.rule,
      recommendation: "approve",
    });
    // Under the auto-refund limit the agent finishes the job itself: the
    // request is approved right away (and a returned device goes back in
    // stock). The server decides this from the amount, not the model.
    if (decision.autoApproved) {
      const approved = await decideRefund(
        request.id,
        "approved",
        `Auto-approved: under the $${decision.autoRefundLimitUsd} limit`,
      );
      if (approved.status === "approved")
        return {
          status: "auto_approved",
          requestId: request.id,
          refundUsd: decision.refundUsd,
          restocked: approved.restocked,
        };
    }
    return {
      status: "created",
      requestId: request.id,
      refundUsd: decision.refundUsd,
    };
  } catch {
    return UNAVAILABLE;
  }
}

export function makeRefundTools(email: string | undefined) {
  return {
    get_purchase_history: tool({
      description:
        "Lists this customer's orders: product, color, plan, price, how many days ago it was bought and whether a refund is already pending or done. Call it first.",
      inputSchema: z.object({}),
      execute: async () => getPurchaseHistory(email),
    }),
    get_refund_rules: tool({
      description:
        "Checks one order against Copper's refund rules and says whether it is eligible, which rule applies and why. Always call it before telling the customer whether they can get a refund.",
      inputSchema: z.object({
        orderId: z.string().describe("The order id, like ORD-1001"),
      }),
      execute: async ({ orderId }) => getRefundRules(email, orderId),
    }),
    request_refund: tool({
      description:
        "Files a refund request for an eligible order. Under the auto-refund limit it is approved on the spot; above it, it waits for a human admin to approve or reject. The result says which. Only call it after get_refund_rules said eligible and the customer wants the refund.",
      inputSchema: z.object({
        orderId: z.string().describe("The order id, like ORD-1001"),
        reason: z
          .string()
          .min(2)
          .describe("Why the customer wants the refund, in their own words"),
      }),
      execute: async ({ orderId, reason }) =>
        requestRefund(email, orderId, reason),
    }),
    hand_to_copper: tool({
      description:
        "Hands the conversation back to Copper Support, for anything that isn't a refund (products, prices, stock, setup, warranty questions).",
      inputSchema: z.object({
        summary: z
          .string()
          .describe("One sentence on what the customer needs next"),
      }),
      execute: async ({ summary }): Promise<Handoff> => ({
        handoff: "copper",
        summary,
      }),
    }),
  };
}

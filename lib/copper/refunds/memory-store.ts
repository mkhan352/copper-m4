// A store that keeps everything in the server's memory, seeded with the demo
// data. It is used when Supabase isn't configured (and in tests). It resets
// when the server restarts, so it's for trying things out, not for keeping.
import {
  CUSTOMERS,
  seedInventory,
  seedOrders,
  seedRequests,
} from "@/lib/copper/refunds/seed";
import type { Store } from "@/lib/copper/refunds/types";

export function createMemoryStore(now = Date.now()): Store {
  const orders = seedOrders(now);
  const requests = seedRequests(now);
  const inventory = seedInventory();
  const settings = new Map<string, string>();
  let counter = 1000 + requests.length;

  return {
    async listCustomers() {
      return structuredClone(CUSTOMERS);
    },
    async listOrders(email) {
      return structuredClone(
        orders.filter((o) => o.customer_email === email.toLowerCase()),
      );
    },
    async listAllOrders() {
      return structuredClone(orders);
    },
    async getSetting(key) {
      return settings.get(key) ?? null;
    },
    async setSetting(key, value) {
      settings.set(key, value);
    },
    async getOrder(id) {
      const order = orders.find((o) => o.id === id);
      return order ? structuredClone(order) : null;
    },
    async createRequest(input) {
      const order = orders.find((o) => o.id === input.order_id);
      if (order) order.refund_status = "pending";
      const request = {
        ...input,
        id: `REQ-${++counter}`,
        status: "pending" as const,
        admin_note: null,
        created_at: new Date().toISOString(),
        decided_at: null,
      };
      requests.push(request);
      return structuredClone(request);
    },
    async listRequests() {
      return structuredClone(requests).reverse();
    },
    async decideRequest(id, decision, note) {
      const request = requests.find((r) => r.id === id);
      if (!request || request.status !== "pending") return null;
      request.status = decision;
      request.admin_note = note;
      request.decided_at = new Date().toISOString();
      const order = orders.find((o) => o.id === request.order_id);
      if (order)
        order.refund_status = decision === "approved" ? "refunded" : "none";
      return structuredClone(request);
    },
    async listInventory() {
      return structuredClone(inventory);
    },
    async addStock(sku, units) {
      const row = inventory.find((r) => r.sku === sku);
      if (!row) return null;
      row.units_in_stock += units;
      return structuredClone(row);
    },
  };
}

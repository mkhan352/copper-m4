// The real store: Supabase Postgres. Only the server uses it, with the
// service-role key, which must never reach the browser.
import { createClient } from "@supabase/supabase-js";
import type {
  InventoryRow,
  Order,
  RefundRequest,
  Store,
} from "@/lib/copper/refunds/types";

export function createSupabaseStore(url: string, key: string): Store {
  const db = createClient(url, key, { auth: { persistSession: false } });
  const ok = <T>(result: { data: T | null; error: unknown }): T => {
    if (result.error || result.data === null)
      throw new Error("The database request failed.");
    return result.data;
  };

  return {
    async listCustomers() {
      return ok(await db.from("customers").select("email,name").order("name"));
    },
    async listOrders(email) {
      return ok(
        await db
          .from("orders")
          .select("*")
          .eq("customer_email", email.toLowerCase())
          .order("purchased_at", { ascending: false }),
      ) as Order[];
    },
    async getOrder(id) {
      const { data } = await db
        .from("orders")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      return (data as Order | null) ?? null;
    },
    async createRequest(input) {
      const request = ok(
        await db.from("refund_requests").insert(input).select("*").single(),
      ) as RefundRequest;
      await db
        .from("orders")
        .update({ refund_status: "pending" })
        .eq("id", input.order_id);
      return request;
    },
    async listRequests() {
      return ok(
        await db
          .from("refund_requests")
          .select("*")
          .order("created_at", { ascending: false }),
      ) as RefundRequest[];
    },
    async decideRequest(id, decision, note) {
      // "where status = 'pending'" makes sure a request is decided only once.
      const { data } = await db
        .from("refund_requests")
        .update({
          status: decision,
          admin_note: note,
          decided_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();
      if (!data) return null;
      await db
        .from("orders")
        .update({
          refund_status: decision === "approved" ? "refunded" : "none",
        })
        .eq("id", data.order_id);
      return data as RefundRequest;
    },
    async listInventory() {
      return ok(
        await db.from("inventory").select("*").order("sku"),
      ) as InventoryRow[];
    },
    async addStock(sku, units) {
      const { data: row } = await db
        .from("inventory")
        .select("*")
        .eq("sku", sku)
        .maybeSingle();
      if (!row) return null;
      const { data } = await db
        .from("inventory")
        .update({ units_in_stock: row.units_in_stock + units })
        .eq("sku", sku)
        .select("*")
        .maybeSingle();
      return (data as InventoryRow | null) ?? null;
    },
  };
}

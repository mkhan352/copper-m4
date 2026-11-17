// Shapes shared by the refund store, rules, tools and the admin page. Field
// names match the Supabase columns they are stored in.

export type OrderKind = "device" | "plan";
export type OrderRefundStatus = "none" | "pending" | "refunded";

export type Order = {
  id: string;
  customer_email: string;
  kind: OrderKind;
  product: string;
  color: string | null;
  sku: string | null;
  billing: "monthly" | "annual" | null;
  amount_usd: number;
  purchased_at: string;
  refund_status: OrderRefundStatus;
};

export type RequestStatus = "pending" | "approved" | "rejected";

export type RefundRequest = {
  id: string;
  order_id: string;
  customer_email: string;
  kind: OrderKind;
  product: string;
  sku: string | null;
  reason: string;
  agent_summary: string;
  amount_usd: number;
  rule_applied: string;
  recommendation: "approve" | "reject";
  status: RequestStatus;
  admin_note: string | null;
  created_at: string;
  decided_at: string | null;
};

export type NewRefundRequest = Omit<
  RefundRequest,
  "id" | "status" | "admin_note" | "created_at" | "decided_at"
>;

/** One row of stock, named like the database columns. */
export type InventoryRow = {
  sku: string;
  product: string;
  color: string;
  units_in_stock: number;
  next_shipment: string;
};

/** Everything the refund features need from storage. */
export type Store = {
  listCustomers(): Promise<{ email: string; name: string }[]>;
  listOrders(email: string): Promise<Order[]>;
  getOrder(id: string): Promise<Order | null>;
  /** Saves the request as pending and marks its order pending. */
  createRequest(input: NewRefundRequest): Promise<RefundRequest>;
  listRequests(): Promise<RefundRequest[]>;
  /** Decides a request only if it is still pending; null if it isn't. */
  decideRequest(
    id: string,
    decision: "approved" | "rejected",
    note: string | null,
  ): Promise<RefundRequest | null>;
  listInventory(): Promise<InventoryRow[]>;
  /** Adds units to a SKU's stock; null if the SKU doesn't exist. */
  addStock(sku: string, units: number): Promise<InventoryRow | null>;
};

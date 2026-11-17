// Demo customers and orders, so every refund path can be tried. Dates are
// "days ago", worked out when the data is created, so the 30-day and 14-day
// windows always work. supabase/seed.sql holds the same data for the database.
import inventory from "@/lib/copper/data/inventory.json";
import type {
  InventoryRow,
  Order,
  RefundRequest,
} from "@/lib/copper/refunds/types";

export const CUSTOMERS = [
  { email: "ava@example.com", name: "Ava" },
  { email: "ben@example.com", name: "Ben" },
  { email: "cara@example.com", name: "Cara" },
  { email: "dan@example.com", name: "Dan" },
  { email: "eve@example.com", name: "Eve" },
  { email: "finn@example.com", name: "Finn" },
];

const DAY = 24 * 60 * 60 * 1000;

type Seed = Omit<Order, "purchased_at"> & { daysAgo: number };

const ORDERS: Seed[] = [
  {
    id: "ORD-1001",
    customer_email: "ava@example.com",
    kind: "device",
    product: "Copper Home",
    color: "Polished Copper",
    sku: "CH-POL",
    billing: null,
    amount_usd: 149,
    daysAgo: 10,
    refund_status: "none",
  },
  {
    id: "ORD-1002",
    customer_email: "ben@example.com",
    kind: "device",
    product: "Copper Notes",
    color: "Night Sky",
    sku: "CN-NSK",
    billing: null,
    amount_usd: 129,
    daysAgo: 45,
    refund_status: "none",
  },
  {
    id: "ORD-1003",
    customer_email: "cara@example.com",
    kind: "plan",
    product: "Copper Plus",
    color: null,
    sku: null,
    billing: "annual",
    amount_usd: 79,
    daysAgo: 5,
    refund_status: "none",
  },
  {
    id: "ORD-1004",
    customer_email: "dan@example.com",
    kind: "plan",
    product: "Copper Plus",
    color: null,
    sku: null,
    billing: "annual",
    amount_usd: 79,
    daysAgo: 40,
    refund_status: "none",
  },
  {
    id: "ORD-1005",
    customer_email: "eve@example.com",
    kind: "plan",
    product: "Copper Plus",
    color: null,
    sku: null,
    billing: "monthly",
    amount_usd: 7.99,
    daysAgo: 20,
    refund_status: "none",
  },
  {
    id: "ORD-1006",
    customer_email: "finn@example.com",
    kind: "device",
    product: "Copper Home",
    color: "Night Sky",
    sku: "CH-NSK",
    billing: null,
    amount_usd: 149,
    daysAgo: 10,
    refund_status: "none",
  },
];

export function seedOrders(now = Date.now()): Order[] {
  return ORDERS.map(({ daysAgo, ...order }) => ({
    ...order,
    purchased_at: new Date(now - daysAgo * DAY).toISOString(),
  }));
}

export function seedInventory(): InventoryRow[] {
  return structuredClone(inventory.inventory);
}

/** No refund requests to start with: customers make them in the chat. */
export function seedRequests(now = Date.now()): RefundRequest[] {
  void now;
  return [];
}

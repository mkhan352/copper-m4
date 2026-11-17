// How many of each product color are on the shelf, and when the next shipment
// lands (Product Bible Section 10). Stock changes (an approved refund puts a
// device back), so check_availability reads it fresh every time.
// This is the only file that knows where stock is kept: the refund store.
import { getStore } from "@/lib/copper/refunds/store";
import type { InventoryRow } from "@/lib/copper/refunds/types";

export type { InventoryRow };

/** Every stock row, or `null` when stock can't be read right now. */
export async function readInventory(): Promise<InventoryRow[] | null> {
  try {
    return await getStore().listInventory();
  } catch {
    return null;
  }
}

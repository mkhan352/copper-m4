// update_availability: puts a returned device back on the shelf. It is run by
// the admin's Approve button after a device refund is approved, and never by
// the chat model, so a customer's wording can't change stock.
import { getStore } from "@/lib/copper/refunds/store";

export type AvailabilityUpdate =
  | { status: "ok"; sku: string; unitsInStock: number }
  | { status: "unknown_sku"; sku: string };

export async function updateAvailability(
  sku: string,
  units = 1,
): Promise<AvailabilityUpdate> {
  const row = await getStore().addStock(sku, units);
  return row
    ? { status: "ok", sku, unitsInStock: row.units_in_stock }
    : { status: "unknown_sku", sku };
}

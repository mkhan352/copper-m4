// What happens when an admin decides a refund request. Approving a device
// refund puts the returned device back in stock (update_availability).
import { updateAvailability } from "@/lib/copper/refunds/availability";
import { getStore } from "@/lib/copper/refunds/store";

export type DecideResult =
  | { status: "not_signed_in" }
  | { status: "already_decided" }
  | { status: "unavailable" }
  | { status: "approved"; restocked: boolean }
  | { status: "rejected" };

export async function decideRefund(
  id: string,
  decision: "approved" | "rejected",
  note: string | null,
): Promise<DecideResult> {
  try {
    // Only a pending request can be decided, so a double click does nothing.
    const request = await getStore().decideRequest(id, decision, note);
    if (!request) return { status: "already_decided" };
    if (decision === "rejected") return { status: "rejected" };
    // The money is simulated; the stock really changes, and only for devices.
    let restocked = false;
    if (request.kind === "device" && request.sku) {
      restocked = (await updateAvailability(request.sku)).status === "ok";
    }
    return { status: "approved", restocked };
  } catch {
    return { status: "unavailable" };
  }
}

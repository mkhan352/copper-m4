"use server";

// Lets the chat ask "has a person decided my refund yet?". The chat sends the
// request ids it filed and the customer's email; only requests that match
// both come back, and only once they are decided. This is how the customer
// hears about an Approve or Reject on any page of the site (Support, the home
// page's chat, or a decision made on /admin).
import type { RefundDecidedDetail } from "@/lib/copper/refunds/events";
import { getStore } from "@/lib/copper/refunds/store";

export async function refundUpdates(
  email: string,
  requestIds: string[],
): Promise<RefundDecidedDetail[]> {
  const who = email.trim().toLowerCase();
  if (!who || requestIds.length === 0) return [];
  const wanted = new Set(requestIds.slice(0, 20));
  try {
    const requests = await getStore().listRequests();
    return requests
      .filter(
        (r) =>
          wanted.has(r.id) &&
          r.customer_email.toLowerCase() === who &&
          r.status !== "pending",
      )
      .map((r) => ({
        requestId: r.id,
        email: r.customer_email,
        product: r.product,
        amountUsd: r.amount_usd,
        status: r.status as "approved" | "rejected",
      }));
  } catch {
    return [];
  }
}

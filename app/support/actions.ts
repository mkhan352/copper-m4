"use server";

// Actions for the Refund Console on /support. This is the class demo's open
// console (anyone with the link can use it); /admin is the same job behind a
// password.
import { revalidatePath } from "next/cache";
import { decideRefund, type DecideResult } from "@/lib/copper/admin/decide";
import type { RefundDecidedDetail } from "@/lib/copper/refunds/events";
import { setAutoRefundLimit } from "@/lib/copper/refunds/settings";
import { getStore } from "@/lib/copper/refunds/store";

export type ConsoleDecision = {
  result: DecideResult;
  /** What to tell the customer in the chat, when the decision went through. */
  detail?: RefundDecidedDetail;
};

/** Approve or reject one pending refund request. */
export async function decideInConsole(
  id: string,
  decision: "approved" | "rejected",
): Promise<ConsoleDecision> {
  const request = (await getStore().listRequests()).find((r) => r.id === id);
  const result = await decideRefund(id, decision, null);
  revalidatePath("/support");
  if (
    !request ||
    (result.status !== "approved" && result.status !== "rejected")
  )
    return { result };
  return {
    result,
    detail: {
      requestId: request.id,
      email: request.customer_email,
      product: request.product,
      amountUsd: request.amount_usd,
      status: result.status,
    },
  };
}

/** Change the auto-refund limit (dollars). */
export async function changeAutoRefundLimit(
  dollars: number,
): Promise<{ ok: boolean }> {
  const ok = await setAutoRefundLimit(dollars);
  revalidatePath("/support");
  return { ok };
}

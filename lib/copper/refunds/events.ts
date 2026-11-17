// How the Refund Console tells the chat that an admin decided a refund. The
// console sends this browser event; the chat shows the message to the customer
// it is for. Safe to import from client components (no server code in here).

export const REFUND_DECIDED_EVENT = "copper:refund-decided";

export type RefundDecidedDetail = {
  requestId: string;
  email: string;
  product: string;
  amountUsd: number;
  status: "approved" | "rejected";
};

/** What the chat tells the customer, in plain words. */
export function decisionNotice(detail: RefundDecidedDetail): string {
  const amount = `$${detail.amountUsd.toFixed(2)}`;
  return detail.status === "approved"
    ? `Good news: a Copper admin approved your refund ${detail.requestId} for your ${detail.product} (${amount}). The refund has been issued.`
    : `Update on your refund ${detail.requestId}: a Copper admin reviewed it and did not approve it, so your ${detail.product} (${amount}) was not refunded and your payment stays as it was. Please contact the Copper Crew if you have questions.`;
}

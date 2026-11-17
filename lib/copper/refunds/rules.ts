// The refund rules (Product Bible 2026 policy), as plain code. The model never
// decides who is eligible: get_refund_rules and request_refund both call this.
import type { Order } from "@/lib/copper/refunds/types";

export const DEVICE_WINDOW_DAYS = 30;
export const ANNUAL_WINDOW_DAYS = 14;

export type RefundDecision = {
  orderId: string;
  eligible: boolean;
  rule: string;
  reason: string;
  refundUsd: number;
  daysSincePurchase: number;
};

const DAY = 24 * 60 * 60 * 1000;

/** Whole days between the purchase and `now`. */
export function daysSince(purchasedAt: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(purchasedAt).getTime()) / DAY));
}

export function evaluateRefund(order: Order, now = Date.now()): RefundDecision {
  const days = daysSince(order.purchased_at, now);
  const base = { orderId: order.id, daysSincePurchase: days };
  const no = (rule: string, reason: string): RefundDecision => ({
    ...base,
    eligible: false,
    rule,
    reason,
    refundUsd: 0,
  });

  if (order.refund_status === "pending")
    return no(
      "One request per order",
      "A refund request for this order is already waiting for review.",
    );
  if (order.refund_status === "refunded")
    return no("One request per order", "This order has already been refunded.");

  if (order.kind === "device") {
    const rule = `Devices: ${DEVICE_WINDOW_DAYS}-day return window`;
    return days <= DEVICE_WINDOW_DAYS
      ? {
          ...base,
          eligible: true,
          rule,
          reason: `Bought ${days} days ago, inside the ${DEVICE_WINDOW_DAYS}-day window.`,
          refundUsd: order.amount_usd,
        }
      : no(
          rule,
          `Bought ${days} days ago, past the ${DEVICE_WINDOW_DAYS}-day window.`,
        );
  }

  if (order.billing === "annual") {
    const rule = `Copper Plus annual: refundable within ${ANNUAL_WINDOW_DAYS} days`;
    return days <= ANNUAL_WINDOW_DAYS
      ? {
          ...base,
          eligible: true,
          rule,
          reason: `Bought ${days} days ago, inside the ${ANNUAL_WINDOW_DAYS}-day window.`,
          refundUsd: order.amount_usd,
        }
      : no(
          rule,
          `Bought ${days} days ago, past the ${ANNUAL_WINDOW_DAYS}-day window.`,
        );
  }

  return no(
    "Copper Plus monthly: no refund for partial months",
    "Monthly plans are not refunded for partial months. You can cancel anytime.",
  );
}

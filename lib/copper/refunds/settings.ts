// The auto-refund limit. An admin can change it in the Refund Console; it is
// kept in the store's settings. Until someone changes it, it starts at
// AUTO_REFUND_LIMIT_USD (or $100).
import { autoRefundLimitUsd } from "@/lib/copper/refunds/rules";
import { getStore } from "@/lib/copper/refunds/store";

const KEY = "auto_refund_limit_usd";

/** The current limit in dollars. Refunds strictly below it are automatic. */
export async function getAutoRefundLimit(): Promise<number> {
  try {
    const saved = await getStore().getSetting(KEY);
    const value = saved === null ? NaN : Number(saved);
    return Number.isFinite(value) && value >= 0 ? value : autoRefundLimitUsd();
  } catch {
    return autoRefundLimitUsd();
  }
}

/** Saves a new limit. Returns false if it isn't a sensible dollar amount. */
export async function setAutoRefundLimit(dollars: number): Promise<boolean> {
  if (!Number.isFinite(dollars) || dollars < 0 || dollars > 100000)
    return false;
  await getStore().setSetting(KEY, String(Math.round(dollars * 100) / 100));
  return true;
}

// The one place that picks where orders, refund requests and stock live:
// Supabase when its two settings exist, otherwise the in-memory demo store.
import { createMemoryStore } from "@/lib/copper/refunds/memory-store";
import { createSupabaseStore } from "@/lib/copper/refunds/supabase-store";
import type { Store } from "@/lib/copper/refunds/types";

export function isDatabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

const globalForStore = globalThis as { __copperStore?: Store };

/** The store, created once per server (the memory one must survive reloads). */
export function getStore(): Store {
  if (!globalForStore.__copperStore) {
    globalForStore.__copperStore = isDatabaseConfigured()
      ? createSupabaseStore(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )
      : createMemoryStore();
  }
  return globalForStore.__copperStore;
}

/** For tests: start again from fresh demo data. */
export function resetStore(store?: Store) {
  globalForStore.__copperStore = store;
}

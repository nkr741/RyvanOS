import type { KeyValueStore } from "@ryvan/storage";
import type { CounterStore } from "@ryvan/policy-engine";

/**
 * Quota counters on the shared key/value store.
 *
 * This is the whole reason quotas need Redis rather than a map: a per-tenant
 * ceiling counted separately in each replica is not a ceiling at all — three
 * replicas would let a tenant through three times over. `KeyValueStore.increment`
 * is atomic, so the count is correct however many processes are serving.
 */
export class KeyValueCounterStore implements CounterStore {
  constructor(private readonly store: KeyValueStore) {}

  async increment(key: string, by: number, ttlMs: number): Promise<number> {
    // The key already encodes its window, so a fresh window starts a fresh
    // counter and the TTL only has to outlive that window.
    return this.store.increment(key, by, ttlMs);
  }

  async read(key: string): Promise<number> {
    const value = await this.store.get<number | string>(key);
    if (value === undefined) return 0;

    const numeric = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
}

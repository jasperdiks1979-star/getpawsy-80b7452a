/**
 * Idempotent abandoned-cart persistence.
 *
 * Defect repaired: every debounced cart change raced its own "does a row
 * already exist?" lookup, so a single cart session could insert many rows
 * (154 rows for 69 sessions). The rules now are:
 *
 *   - exactly ONE active (not recovered) row per cart session id
 *   - all writes for a session are serialized, so a lookup can never race
 *     another insert
 *   - the resolved row id is cached for the lifetime of the tab
 *   - historical rows are never deleted; an existing active row is reused
 *
 * The storage layer is injected so this is unit-testable without Supabase.
 */

export interface AbandonedCartItem {
  id: string;
  name: string;
  price: number;
  image?: string | null;
  quantity: number;
  variant?: string | null;
}

export interface AbandonedCartPayload {
  sessionId: string;
  customerEmail?: string | null;
  items: AbandonedCartItem[];
  cartTotal: number;
}

export interface AbandonedCartStore {
  /** Newest active (recovered_at IS NULL) row for the session, or null. */
  findActive(sessionId: string): Promise<{ id: string } | null>;
  update(id: string, payload: AbandonedCartPayload): Promise<void>;
  insert(payload: AbandonedCartPayload): Promise<{ id: string } | null>;
}

const rowIdBySession = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

/** Test-only: forget cached row ids. */
export function resetAbandonedCartCache(): void {
  rowIdBySession.clear();
  queue = Promise.resolve();
}

async function run(store: AbandonedCartStore, payload: AbandonedCartPayload): Promise<void> {
  if (payload.items.length === 0) return;
  const { sessionId } = payload;

  const cachedId = rowIdBySession.get(sessionId);
  if (cachedId) {
    await store.update(cachedId, payload);
    return;
  }

  const existing = await store.findActive(sessionId);
  if (existing?.id) {
    rowIdBySession.set(sessionId, existing.id);
    await store.update(existing.id, payload);
    return;
  }

  const inserted = await store.insert(payload);
  if (inserted?.id) rowIdBySession.set(sessionId, inserted.id);
}

/**
 * Serialized, idempotent write. Concurrent calls for the same session can
 * never produce a second active row.
 */
export function syncAbandonedCart(
  store: AbandonedCartStore,
  payload: AbandonedCartPayload,
): Promise<void> {
  const next = queue.then(() => run(store, payload)).catch((error) => {
    console.error('Error syncing abandoned cart:', error);
  });
  queue = next;
  return next;
}

/** Called after a cart is recovered/cleared so a new session starts clean. */
export function forgetAbandonedCartRow(sessionId: string): void {
  rowIdBySession.delete(sessionId);
}

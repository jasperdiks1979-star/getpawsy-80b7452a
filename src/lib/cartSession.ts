/**
 * Canonical cart identity.
 *
 * `pawsy-cart-session-id` is the ONE stable cart identifier. It is used by:
 *   - abandoned cart persistence (one active row per session id)
 *   - checkout funnel events (`cart_id`), so a checkout click is never
 *     marked degraded purely because no cart identity was supplied.
 *
 * Never invent a second identity — always read through these helpers.
 */

export const CART_SESSION_STORAGE_KEY = 'pawsy-cart-session-id';

function makeId(): string {
  return `cart-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/** Returns the persistent cart session id, creating it on first use. */
export function getCartSessionId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    let sessionId = localStorage.getItem(CART_SESSION_STORAGE_KEY);
    if (!sessionId) {
      sessionId = makeId();
      localStorage.setItem(CART_SESSION_STORAGE_KEY, sessionId);
    }
    return sessionId;
  } catch {
    // Storage disabled (private mode) — still give callers a usable id so the
    // funnel event is not degraded; it simply won't survive a reload.
    return makeId();
  }
}

/** Drops the cart identity — called only when a cart is completed/cleared. */
export function clearCartSessionId(): void {
  try {
    localStorage.removeItem(CART_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

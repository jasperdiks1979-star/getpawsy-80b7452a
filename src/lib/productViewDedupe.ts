/**
 * Product-view dedupe gate.
 *
 * A PDP can mount more than once for the same logical view: React remounts,
 * hydration after a direct landing, back/forward navigation inside the SPA,
 * or a variant-driven re-resolve of the same product id. Each of those would
 * previously emit an extra CANONICAL_PRODUCT_VIEW and inflate the funnel.
 *
 * Rule: one PRODUCT_VIEW per (session, product) per logical view window.
 * Re-viewing the same product later in the session (after the window) counts
 * again — that is a genuine second view.
 *
 * Fails open: any storage error returns `true` so analytics never blocks or
 * silently drops a real event.
 */
const KEY = 'gp_pv_seen';
export const PRODUCT_VIEW_WINDOW_MS = 30_000;

type SeenMap = Record<string, number>;

function read(): SeenMap {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
}

/**
 * Returns true when this product view should be recorded, and marks it as
 * seen. Returns false when an identical view was recorded inside the window.
 */
export function shouldRecordProductView(
  sessionId: string | null | undefined,
  productId: string | null | undefined,
  windowMs: number = PRODUCT_VIEW_WINDOW_MS,
): boolean {
  try {
    if (typeof window === 'undefined' || !productId) return true;
    const now = Date.now();
    const key = `${sessionId || 'nosession'}:${productId}`;
    const map = read();
    const last = map[key];
    if (typeof last === 'number' && now - last < windowMs) return false;
    // Prune anything older than 4x the window so the map stays small.
    const next: SeenMap = {};
    for (const [k, v] of Object.entries(map)) {
      if (now - v < windowMs * 4) next[k] = v;
    }
    next[key] = now;
    sessionStorage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch {
    return true;
  }
}

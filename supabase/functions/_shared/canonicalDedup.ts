/**
 * Canonical analytics dedup keys — SINGLE SOURCE OF TRUTH.
 *
 * Both writers of `canonical_events` must produce identical keys for the same
 * source event, otherwise one logical event lands twice:
 *   1. edge function `canonical-ingest` (this module)
 *   2. SQL function `public.canonical_ingest_recent` (mirrors the purchase
 *      branch of this module verbatim — see migration 20260916_*)
 *
 * PURCHASE is anchored on the order / Stripe session identity only, never on a
 * time bucket or the source row id, so one paid checkout can only ever yield
 * one canonical purchase and one revenue amount.
 */

export type Canon =
  | "CANONICAL_PAGE_VIEW"
  | "CANONICAL_PRODUCT_VIEW"
  | "CANONICAL_ADD_TO_CART"
  | "CANONICAL_CART"
  | "CANONICAL_CHECKOUT"
  | "CANONICAL_PURCHASE"
  | "CANONICAL_ENGAGEMENT";

export function dedup(parts: Array<string | null | undefined>): string {
  return parts.map((p) => p ?? "").join("|");
}

export function bucketISO(iso: string | null | undefined, seconds: number): string {
  const t = iso ? new Date(iso).getTime() : Date.now();
  const b = Math.floor(t / (seconds * 1000)) * seconds * 1000;
  return new Date(b).toISOString();
}

/**
 * Semantic dedup key — collapses repeated clicks / redirects / page-reloads
 * inside a short window into a single canonical event.
 *
 * Buckets:
 *   PAGE_VIEW / ENGAGEMENT:  session + canonical + path        + 60s
 *   PRODUCT_VIEW:            session + canonical + product     + 60s
 *   ADD_TO_CART:             session + canonical + product     + 30s
 *   CART:                    session + canonical               + 60s
 *   CHECKOUT:                session + canonical + stripe_sess + 30m
 *   PURCHASE:                source + canonical + order_id OR stripe_session_id
 */
export function semanticDedupKey(input: {
  source: string;
  canonical: Canon;
  session_id?: string | null;
  product_id?: string | null;
  page_path?: string | null;
  stripe_session_id?: string | null;
  order_id?: string | null;
  occurred_at?: string | null;
}): string {
  const { source, canonical, session_id, product_id, page_path, stripe_session_id, order_id, occurred_at } = input;
  if (canonical === "CANONICAL_PURCHASE") {
    const anchor = order_id ?? stripe_session_id ?? session_id ?? "unknown";
    return dedup([source, canonical, anchor]);
  }
  let windowSec = 60;
  let anchor: string | null | undefined = null;
  if (canonical === "CANONICAL_ADD_TO_CART") { windowSec = 30; anchor = product_id; }
  else if (canonical === "CANONICAL_PRODUCT_VIEW") { anchor = product_id; }
  else if (canonical === "CANONICAL_CHECKOUT") {
    anchor = stripe_session_id ?? null;
    windowSec = 1800;
  }
  else if (canonical === "CANONICAL_PAGE_VIEW") { anchor = page_path; }
  else if (canonical === "CANONICAL_ENGAGEMENT") { anchor = page_path; }
  return dedup([source, canonical, session_id, anchor, bucketISO(occurred_at, windowSec)]);
}

/**
 * Source-event dedup key for NON-purchase cci rows — mirrors the SQL writer
 * `public.canonical_ingest_recent` byte-for-byte:
 *   concat_ws('|', 'cci', e.id::text, e.session_id, <canonical>, COALESCE(e.product_id,''))
 * concat_ws skips NULL arguments (but keeps empty strings), so a NULL
 * session_id is omitted, never rendered as "". Both writers therefore land
 * the same source row on the same key and ON CONFLICT DO NOTHING collapses it.
 * Distinct source rows (genuine repeated events) keep distinct keys.
 */
export function cciSourceDedupKey(input: {
  id: string;
  session_id?: string | null;
  canonical: Canon;
  product_id?: string | null;
}): string {
  const parts: string[] = ["cci", String(input.id)];
  if (input.session_id !== null && input.session_id !== undefined) parts.push(input.session_id);
  parts.push(input.canonical, input.product_id ?? "");
  return parts.join("|");
}

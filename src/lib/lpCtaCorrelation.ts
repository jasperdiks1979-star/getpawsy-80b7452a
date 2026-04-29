/**
 * lpCtaCorrelation — links every /go landing-page CTA click to the next
 * PDP view (`view_item`) and the next add-to-cart (`add_to_cart`) for the
 * same browser session, so we can attribute downstream conversions back
 * to the specific CTA placement (bio_primary / bio_secondary / bio_sticky)
 * and bucketed hook campaign that drove them.
 *
 * How it works:
 *   1. When `lp_cta_click` fires, `recordLpCtaClick()` stores a snapshot
 *      in sessionStorage: a fresh click_id, the placement, the resolved
 *      UTM attribution, and a high-resolution timestamp.
 *   2. Inside `trackEvent`, `enrichEventWithLpCta()` inspects every
 *      outgoing event. For `view_item` and `add_to_cart`, it merges the
 *      stored click context as `lp_*` fields and computes a millisecond
 *      delta (`lp_time_to_view_ms` / `lp_time_to_atc_ms`).
 *   3. The PDP view consumes the "view" slot, the add-to-cart consumes
 *      the "atc" slot — each downstream event is attributed exactly once
 *      so subsequent organic activity isn't falsely tagged.
 *
 * No persistence beyond the session: the snapshot is dropped when the
 * browser tab closes. Surface = sessionStorage to ride the same lifetime
 * as the existing UTM cache used by utmNormalizer.
 */

const STORAGE_KEY = 'gp_lp_cta_link';

type Snapshot = {
  click_id: string;
  placement: string;
  campaign: string | null;
  source: string | null;
  medium: string | null;
  content: string | null;
  clicked_at: number;
  /** event names that have already consumed this snapshot */
  consumed: string[];
};

function safeSession(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readSnapshot(): Snapshot | null {
  const store = safeSession();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    if (!parsed?.click_id || !parsed?.placement) return null;
    if (!Array.isArray(parsed.consumed)) parsed.consumed = [];
    return parsed;
  } catch {
    return null;
  }
}

function writeSnapshot(snap: Snapshot | null): void {
  const store = safeSession();
  if (!store) return;
  try {
    if (!snap) {
      store.removeItem(STORAGE_KEY);
      return;
    }
    store.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

function newClickId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof (crypto as Crypto).randomUUID === 'function'
  ) {
    return (crypto as Crypto).randomUUID();
  }
  return `lp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Record an `lp_cta_click` so the next downstream conversion event in the
 * same session can be attributed back to it. Always overwrites the slot —
 * the most recent CTA click is the one that drove the next PDP visit.
 */
export function recordLpCtaClick(params: {
  placement: string;
  attribution?: Record<string, string | null | undefined> | null;
}): { click_id: string; clicked_at: number } {
  const attribution = params.attribution ?? {};
  const snap: Snapshot = {
    click_id: newClickId(),
    placement: params.placement,
    campaign: (attribution.utm_campaign as string | null | undefined) ?? null,
    source: (attribution.utm_source as string | null | undefined) ?? null,
    medium: (attribution.utm_medium as string | null | undefined) ?? null,
    content: (attribution.utm_content as string | null | undefined) ?? null,
    clicked_at: Date.now(),
    consumed: [],
  };
  writeSnapshot(snap);
  return { click_id: snap.click_id, clicked_at: snap.clicked_at };
}

/** Maximum gap we still treat as "the click drove this event" (15 minutes). */
const ATTRIBUTION_WINDOW_MS = 15 * 60 * 1000;

/** Map of downstream event → which slot we should mark consumed. */
const CORRELATED_EVENTS: Record<string, 'view' | 'atc'> = {
  view_item: 'view',
  add_to_cart: 'atc',
};

/**
 * Inspect an outgoing analytics event. If it's a downstream conversion
 * event and a recent CTA click is on file, return enrichment params that
 * the caller should merge in. Returns `null` when there's nothing to add.
 */
export function enrichEventWithLpCta(
  eventName: string,
  params?: Record<string, unknown>,
): Record<string, unknown> | null {
  const slot = CORRELATED_EVENTS[eventName];
  if (!slot) return null;

  const snap = readSnapshot();
  if (!snap) return null;

  // Don't re-attribute the same kind of event twice from one click.
  if (snap.consumed.includes(slot)) return null;

  const now = Date.now();
  const dt = now - snap.clicked_at;
  if (dt < 0 || dt > ATTRIBUTION_WINDOW_MS) {
    // Click is stale — drop it so future organic events stay clean.
    writeSnapshot(null);
    return null;
  }

  const enrichment: Record<string, unknown> = {
    lp_click_id: snap.click_id,
    lp_placement: snap.placement,
    lp_campaign: snap.campaign,
    lp_source: snap.source,
    lp_medium: snap.medium,
    lp_content: snap.content,
    lp_clicked_at: snap.clicked_at,
  };
  if (slot === 'view') {
    enrichment.lp_time_to_view_ms = dt;
  } else if (slot === 'atc') {
    enrichment.lp_time_to_atc_ms = dt;
  }

  // Mark this slot consumed but keep the snapshot around so the OTHER
  // slot can still attribute (e.g. view_item now, add_to_cart later).
  const next: Snapshot = { ...snap, consumed: [...snap.consumed, slot] };
  // Once both slots are consumed, drop the snapshot entirely.
  if (next.consumed.includes('view') && next.consumed.includes('atc')) {
    writeSnapshot(null);
  } else {
    writeSnapshot(next);
  }

  // Touch params to silence the unused-var lint without changing semantics.
  void params;
  return enrichment;
}

/** Test/debug helper — clear the correlation slot. */
export function clearLpCtaCorrelation(): void {
  writeSnapshot(null);
}
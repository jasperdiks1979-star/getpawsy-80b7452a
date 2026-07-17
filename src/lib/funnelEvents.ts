/**
 * Centralized funnel event firing with integrity guarantees:
 *   - event_source tag (user_click | system_restore | bot_filtered | debug)
 *   - idempotency_key (sha-style hash of session|event|product|10s-bucket)
 *   - 10s dedupe window per (session, event, product) in sessionStorage
 *   - bot classification + geo_quality enrichment on every row
 *
 * All fires are best-effort and never throw — analytics must never break UX.
 * This file is the SINGLE entry point for any event we expect to count as a
 * "real user action" in the /admin/funnel-health dashboard.
 */
import { supabase } from '@/integrations/supabase/client';
import { getBotClassification, recordEventTimingSample, markEngagementVerified } from '@/lib/botDetection';
import { getFirstTouch, getLastTouch, classifySource } from '@/lib/attribution';
import { ensureGeoClassified, getCachedUsTier, getCachedGeoCountry } from '@/lib/geoClassify';
import { getDeviceClassification } from '@/lib/deviceClassify';
import { getCanonicalSessionId } from '@/lib/canonicalSession';

const SESSION_KEY = 'gp_session_id';
const DEDUPE_PREFIX = 'gp_fe_dedupe_';
const DEDUPE_WINDOW_MS = 10_000;

export type EventSource =
  | 'user_click'
  | 'system_restore'
  | 'bot_filtered'
  | 'debug'
  | 'crawler'
  | 'unknown';

function getSessionId(): string {
  try { return getCanonicalSessionId(); } catch { return `anon_${Date.now()}`; }
}

/** djb2 hash → hex string. Stable across runs, no Web Crypto async cost. */
function stableHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function bucket10s(ts: number = Date.now()): number {
  return Math.floor(ts / DEDUPE_WINDOW_MS);
}

function makeIdempotencyKey(
  sessionId: string,
  event: string,
  productId: string | null,
  variantId: string | null,
): string {
  return stableHash(
    `${sessionId}|${event}|${productId ?? '_'}|${variantId ?? '_'}|${bucket10s()}`,
  );
}

/**
 * Read-only dedupe peek. Used by `envelope()` so that QA / skipDedupe events
 * never poison the cache for subsequent real events in the same 10s bucket.
 */
function peekDuplicate(key: string): boolean {
  try {
    return !!sessionStorage.getItem(DEDUPE_PREFIX + key);
  } catch {
    return false;
  }
}

/**
 * Mark an idempotency key as consumed. Callers MUST invoke this only after
 * passing all gates (not bot, not QA, not skipDedupe) and only when an actual
 * insert is about to fire — otherwise we'd silently drop the next real event
 * in the same 10s bucket.
 */
function markDeduped(key: string): void {
  try {
    sessionStorage.setItem(DEDUPE_PREFIX + key, String(Date.now()));
  } catch {
    /* ignore */
  }
}

function getGeoQuality(): string {
  try {
    // Kick off geo classification once per session (idle-scheduled, non-blocking).
    ensureGeoClassified();
    const cached = sessionStorage.getItem('gp_geo_quality_v1');
    if (cached) return cached;
  } catch {
    /* ignore */
  }
  return 'unknown';
}

/**
 * Compute the funnel classification label for KPI filtering:
 *   verified_user  — real human, full signals (passes bot + has device + non-bot UA)
 *   probable_user  — partial signals (e.g. unknown geo but real device + no bot flags)
 *   bot_like       — botDetection flagged
 *   legacy_unknown — missing critical signals (no device, no UA)
 *   qa             — explicit QA-simulated event (set by caller, not here)
 */
function classifyTraffic(isBot: boolean, qualityScore: number, deviceConfidence: number): string {
  if (isBot) return 'bot_like';
  if (deviceConfidence < 40) return 'legacy_unknown';
  if (qualityScore >= 80 && deviceConfidence >= 80) return 'verified_user';
  return 'probable_user';
}

/** Build the common envelope for every event row. */
function envelope(opts: {
  event_source: EventSource;
  source_component: string;
  product_id?: string | null;
  variant_id?: string | null;
  event: string;
}): {
  session_id: string;
  event_source: EventSource;
  source_component: string;
  idempotency_key: string;
  user_action_id: string;
  is_bot: boolean;
  bot_reason: string | null;
  traffic_quality_score: number;
  geo_quality: string;
  deduped: boolean;
  classification: string;
  geo_tier: string;
  geo_country: string | null;
  device: string;
  os_family: string;
  browser_family: string;
  in_app_browser: string | null;
} {
  recordEventTimingSample();
  const sessionId = getSessionId();
  const cls = getBotClassification();
  const dev = getDeviceClassification();
  const key = makeIdempotencyKey(
    sessionId,
    opts.event,
    opts.product_id ?? null,
    opts.variant_id ?? null,
  );
  return {
    session_id: sessionId,
    event_source: opts.event_source,
    source_component: opts.source_component,
    idempotency_key: key,
    user_action_id: `${sessionId}:${key}`,
    is_bot: cls.is_bot,
    bot_reason: cls.bot_reason,
    traffic_quality_score: cls.traffic_quality_score,
    geo_quality: getGeoQuality(),
    deduped: peekDuplicate(key),
    classification: classifyTraffic(cls.is_bot, cls.traffic_quality_score, dev.device_confidence),
    geo_tier: getCachedUsTier(),
    geo_country: getCachedGeoCountry(),
    device: dev.device,
    os_family: dev.os_family,
    browser_family: dev.browser_family,
    in_app_browser: dev.in_app_browser,
  };
}

/**
 * Shape the quality + classification fields for direct spread into the
 * inserted row. Centralised so every event writer (ATC, checkout, lp_event)
 * gets the same columns populated — that's what drives the admin Clean filter.
 */
function qualityFields(env: ReturnType<typeof envelope>): Record<string, unknown> {
  return {
    classification: env.classification,
    geo_tier: env.geo_tier,
    geo_country: env.geo_country,
    device: env.device,
    os_family: env.os_family,
    browser_family: env.browser_family,
    in_app_browser: env.in_app_browser,
  };
}

export interface UserAddToCartInput {
  product_id: string;
  /** Optional product slug — used as fallback identifier when product_id is missing/empty. */
  slug?: string | null;
  product_name?: string | null;
  variant_id?: string | null;
  qty: number;
  price: number;
  currency?: string;
  source_component: string; // e.g. 'pdp_sticky_cta', 'cart_drawer', 'pdp_main_cta'
  /** QA-simulated event from admin dashboard — tagged classification='qa', excluded from Clean. */
  qa?: boolean;
}

/**
 * Fire a REAL user-click add-to-cart event. Caller MUST be inside a user
 * click handler — never fire from mount, hydration, or sticky-sync effects.
 */
export function fireUserAddToCart(input: UserAddToCartInput): void {
  try {
    // QA-only bypass: when localStorage.gp_qa_atc_bypass=1 is set on THIS
    // browser, force the event to be tagged qa=true so it bypasses the
    // bot / dedupe gates and proves the insert path for headless E2E.
    // Never trust a URL param or cookie for this — must be set manually.
    let qaEffective = !!input.qa;
    try {
      if (!qaEffective && typeof localStorage !== 'undefined' &&
          localStorage.getItem('gp_qa_atc_bypass') === '1') {
        qaEffective = true;
      }
    } catch { /* ignore */ }
    const forensicOn = (() => {
      try {
        return typeof localStorage !== 'undefined' &&
          localStorage.getItem('gp_atc_forensic') === '1';
      } catch { return false; }
    })();
    // Degraded path: product_id and/or slug missing → STILL record the
    // event so the Clean KPI dashboard can count the intent and segment
    // it by classification / geo_tier / device. Without this fallback we
    // were silently dropping ATC clicks whenever the PDP failed to wire
    // product metadata, which inflated checkout-without-ATC anomalies.
    const hasProductId = typeof input.product_id === 'string' && input.product_id.length > 0;
    const hasSlug = typeof input.slug === 'string' && (input.slug?.length ?? 0) > 0;
    const degraded = !hasProductId;
    // When neither identifier is present, scope the idempotency key to the
    // source_component so two distinct placements firing in the same 10s
    // bucket aren't collapsed into one row.
    const fallbackProductKey = hasProductId
      ? input.product_id
      : hasSlug
      ? (input.slug as string)
      : `__nopid__:${input.source_component}`;
    const env = envelope({
      event_source: 'user_click',
      source_component: input.source_component,
      product_id: fallbackProductKey,
      variant_id: input.variant_id ?? null,
      event: 'add_to_cart',
    });
    if (env.is_bot && !qaEffective) {
      try {
        (globalThis as any).__gp_last_atc = {
          ts: Date.now(), branch: 'gate_is_bot',
          session_id: env.session_id, product_id: fallbackProductKey,
          idempotency_key: env.idempotency_key,
          is_bot: env.is_bot, bot_reason: env.bot_reason,
          deduped: env.deduped, classification: env.classification,
          geo_country: env.geo_country, geo_tier: env.geo_tier, qa: false,
        };
        if (forensicOn) console.info('[ATC-FORENSIC]', (globalThis as any).__gp_last_atc);
      } catch { /* ignore */ }
      return; // never count bot ATC (except QA)
    }
    if (env.deduped && !qaEffective) {
      try {
        (globalThis as any).__gp_last_atc = {
          ts: Date.now(), branch: 'gate_deduped',
          session_id: env.session_id, product_id: fallbackProductKey,
          idempotency_key: env.idempotency_key,
          is_bot: env.is_bot, bot_reason: env.bot_reason,
          deduped: env.deduped, classification: env.classification,
          geo_country: env.geo_country, geo_tier: env.geo_tier, qa: false,
        };
        if (forensicOn) console.info('[ATC-FORENSIC]', (globalThis as any).__gp_last_atc);
      } catch { /* ignore */ }
      return; // collapsed inside 10s window
    }
    // Forensic breadcrumb (always set on window, only logged when opt-in).
    try {
      (globalThis as any).__gp_last_atc = {
        ts: Date.now(),
        session_id: env.session_id,
        product_id: fallbackProductKey,
        idempotency_key: env.idempotency_key,
        is_bot: env.is_bot,
        bot_reason: env.bot_reason,
        deduped: env.deduped,
        classification: env.classification,
        geo_country: env.geo_country,
        geo_tier: env.geo_tier,
        qa: qaEffective,
        branch: 'insert_attempted',
      };
      if (forensicOn) console.info('[ATC-FORENSIC]', (globalThis as any).__gp_last_atc);
    } catch { /* ignore */ }
    // Reserve the 10s bucket only for real (non-QA) events that will insert.
    if (!qaEffective) markDeduped(env.idempotency_key);

    const last = getLastTouch() ?? classifySource();
    const first = getFirstTouch() ?? last;

    const row: Record<string, unknown> = {
      session_id: env.session_id,
      event_name: 'add_to_cart',
      page_path: typeof window !== 'undefined' ? window.location.pathname : null,
      product_id: hasProductId ? input.product_id : null,
      product_name: input.product_name ?? null,
      value: input.price * input.qty,
      utm_source: last.source,
      utm_medium: last.medium,
      utm_campaign: last.campaign,
      event_source: env.event_source,
      user_action_id: env.user_action_id,
      idempotency_key: env.idempotency_key,
      source_component: env.source_component,
      is_bot: env.is_bot,
      bot_reason: env.bot_reason,
      geo_quality: env.geo_quality,
      traffic_quality_score: env.traffic_quality_score,
      deduped: env.deduped,
      validation_status: degraded ? 'degraded' : 'verified',
      degraded,
      ...qualityFields(env),
      ...(qaEffective ? { classification: 'qa', qa: true } : { qa: false }),
      raw_payload: {
        slug: input.slug ?? null,
        qty: input.qty,
        price: input.price,
        currency: input.currency ?? 'USD',
        degraded,
        degraded_reason: degraded
          ? !hasProductId && !hasSlug
            ? 'no_product_id_or_slug'
            : 'no_product_id'
          : null,
        first_touch: first,
        last_touch: last,
      },
    };
    void supabase.from('lp_funnel_events').insert(row as never).then(({ error }) => {
      try {
        (globalThis as any).__gp_last_atc = {
          ...((globalThis as any).__gp_last_atc || {}),
          insert_done: true,
          insert_error: error ? { code: error.code, message: error.message } : null,
        };
        console.info('[ATC-FORENSIC-INSERT]', error ? error : 'ok');
      } catch { /* ignore */ }
      if (error && error.code !== '23505') {
        console.debug('[funnelEvents] ATC insert failed:', error.message);
      }
    });
  } catch (e) {
    console.debug('[funnelEvents] fireUserAddToCart threw:', e);
  }
}

export interface RemoveFromCartInput {
  product_id: string;
  slug?: string | null;
  product_name?: string | null;
  variant_id?: string | null;
  qty: number;
  price: number;
  currency?: string;
  source_component: string;
  qa?: boolean;
}

/** Mirror a remove_from_cart user click into lp_funnel_events. */
export function fireUserRemoveFromCart(input: RemoveFromCartInput): void {
  try {
    const hasProductId = typeof input.product_id === 'string' && input.product_id.length > 0;
    const hasSlug = typeof input.slug === 'string' && (input.slug?.length ?? 0) > 0;
    const degraded = !hasProductId;
    const fallbackProductKey = hasProductId
      ? input.product_id
      : hasSlug
      ? (input.slug as string)
      : `__nopid__:${input.source_component}`;
    const env = envelope({
      event_source: 'user_click',
      source_component: input.source_component,
      product_id: fallbackProductKey,
      variant_id: input.variant_id ?? null,
      event: 'remove_from_cart',
    });
    if (env.is_bot && !input.qa) return;
    if (env.deduped && !input.qa) return;
    if (!input.qa) markDeduped(env.idempotency_key);

    const last = getLastTouch() ?? classifySource();
    const first = getFirstTouch() ?? last;
    const row: Record<string, unknown> = {
      session_id: env.session_id,
      event_name: 'remove_from_cart',
      page_path: typeof window !== 'undefined' ? window.location.pathname : null,
      product_id: hasProductId ? input.product_id : null,
      product_name: input.product_name ?? null,
      value: input.price * input.qty,
      utm_source: last.source,
      utm_medium: last.medium,
      utm_campaign: last.campaign,
      event_source: env.event_source,
      user_action_id: env.user_action_id,
      idempotency_key: env.idempotency_key,
      source_component: env.source_component,
      is_bot: env.is_bot,
      bot_reason: env.bot_reason,
      geo_quality: env.geo_quality,
      traffic_quality_score: env.traffic_quality_score,
      deduped: env.deduped,
      validation_status: degraded ? 'degraded' : 'verified',
      degraded,
      ...qualityFields(env),
      ...(input.qa ? { classification: 'qa', qa: true } : { qa: false }),
      raw_payload: {
        slug: input.slug ?? null,
        qty: input.qty,
        price: input.price,
        currency: input.currency ?? 'USD',
        first_touch: first,
        last_touch: last,
      },
    };
    void supabase.from('lp_funnel_events').insert(row as never).then(({ error }) => {
      if (error && error.code !== '23505') {
        console.debug('[funnelEvents] remove_from_cart insert failed:', error.message);
      }
    });
  } catch (e) {
    console.debug('[funnelEvents] fireUserRemoveFromCart threw:', e);
  }
}

export interface CheckoutEventInput {
  step:
    | 'checkout_click'
    | 'checkout_redirect_attempt'
    | 'checkout_redirect_success'
    | 'checkout_error'
    | 'shipping_country_blocked';
  source_component: string;
  cart_id?: string | null;
  item_count?: number | null;
  value?: number | null;
  currency?: string;
  destination_url?: string | null;
  error_reason?: string | null;
  /** QA-simulated event — tagged qa=true, excluded from Clean KPI. */
  qa?: boolean;
}

export function fireCheckoutEvent(input: CheckoutEventInput): void {
  try {
    // Degraded path: a checkout click without a cart_id or item_count
    // means the cart context never hydrated. We still record the event
    // (envelope intact) so Clean KPIs include the intent, and tag it as
    // degraded so the dashboard can surface it for repair.
    const hasCartId = typeof input.cart_id === 'string' && input.cart_id.length > 0;
    const hasItems = typeof input.item_count === 'number' && input.item_count > 0;
    const degraded = !hasCartId || !hasItems;
    const env = envelope({
      event_source: 'user_click',
      source_component: input.source_component,
      event: input.step,
      product_id: input.cart_id ?? null,
    });
    // Always log the attempt so we can see in a single test why an
    // event was (or wasn't) inserted. No PII, only flags + keys.
    console.info('[funnel:checkout]', {
      step: input.step,
      source_component: input.source_component,
      session_id: env.session_id,
      idempotency_key: env.idempotency_key,
      deduped: env.deduped,
      is_bot: env.is_bot,
      bot_reason: env.bot_reason,
      geo_quality: env.geo_quality,
      traffic_quality_score: env.traffic_quality_score,
    });
    if (env.is_bot && !input.qa) {
      console.warn('[funnel:checkout] skipped — is_bot', {
        step: input.step,
        bot_reason: env.bot_reason,
      });
      return;
    }
    if (env.deduped && input.step === 'checkout_click' && !input.qa) {
      console.warn('[funnel:checkout] skipped — deduped (idempotency window)', {
        step: input.step,
        idempotency_key: env.idempotency_key,
      });
      return;
    }
    // Reserve the 10s bucket only for real checkout_click (other steps fire
    // at most once per redirect cycle and should never collapse each other).
    if (input.step === 'checkout_click' && !input.qa) {
      markDeduped(env.idempotency_key);
    }

    const last = getLastTouch() ?? classifySource();
    const row: Record<string, unknown> = {
      session_id: env.session_id,
      step: input.step,
      value: input.value ?? null,
      currency: input.currency ?? 'usd',
      metadata: {
        item_count: input.item_count ?? null,
        source: last.source,
        medium: last.medium,
        campaign: last.campaign,
        degraded,
        degraded_reason: degraded
          ? !hasCartId && !hasItems
            ? 'no_cart_or_items'
            : !hasCartId
            ? 'no_cart_id'
            : 'no_item_count'
          : null,
      },
      source: 'client',
      event_source: env.event_source,
      user_action_id: env.user_action_id,
      idempotency_key: env.idempotency_key,
      source_component: env.source_component,
      is_bot: env.is_bot,
      bot_reason: env.bot_reason,
      geo_quality: env.geo_quality,
      cart_id: input.cart_id ?? null,
      item_count: input.item_count ?? null,
      destination_url: input.destination_url ?? null,
      error_reason: input.error_reason ?? null,
      ...qualityFields(env),
      ...(input.qa ? { classification: 'qa', qa: true } : { qa: false }),
    };
    void supabase
      .from('checkout_funnel_events')
      .insert(row as never)
      .then(({ error }) => {
        if (error && error.code !== '23505') {
          console.debug('[funnelEvents] checkout insert failed:', error.message);
        }
      });
  } catch (e) {
    console.debug('[funnelEvents] fireCheckoutEvent threw:', e);
  }
}

export function fireCheckoutClick(input: Omit<CheckoutEventInput, 'step'>): void {
  fireCheckoutEvent({ ...input, step: 'checkout_click' });
}
export function fireCheckoutRedirect(input: Omit<CheckoutEventInput, 'step'>): void {
  fireCheckoutEvent({ ...input, step: 'checkout_redirect_success' });
}
export function fireCheckoutError(input: Omit<CheckoutEventInput, 'step'>): void {
  fireCheckoutEvent({ ...input, step: 'checkout_error' });
}

/* ─────────────────────────────────────────────────────────────────────────
 * Phase 4+5 additive event helpers — production-safe, never throws,
 * never blocks render, never touches Stripe / checkout creation logic.
 * All rows land in `lp_funnel_events` reusing existing schema + raw_payload.
 * ──────────────────────────────────────────────────────────────────────── */

function detectDeviceType(): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
  try {
    const ua = navigator.userAgent || '';
    if (/iPad|tablet|Tablet/i.test(ua)) return 'tablet';
    if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'mobile';
    return 'desktop';
  } catch {
    return 'unknown';
  }
}

function detectOs(): string {
  try {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    if (/Mac OS X/i.test(ua)) return 'macos';
    if (/Windows/i.test(ua)) return 'windows';
    if (/Linux/i.test(ua)) return 'linux';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function insertLpEvent(row: Record<string, unknown>): void {
  try {
    void supabase.from('lp_funnel_events').insert(row as never).then(({ error }) => {
      if (error && error.code !== '23505') {
        console.debug('[funnelEvents] insert failed:', error.message);
      }
    });
  } catch (e) {
    console.debug('[funnelEvents] insert threw:', e);
  }
}

/** Generic additive event writer (used by all Phase 4+5 helpers). */
function fireLpEvent(opts: {
  event_name: string;
  source_component: string;
  product_id?: string | null;
  product_name?: string | null;
  value?: number | null;
  extra?: Record<string, unknown>;
  /** When true, skip the 10s idempotency dedupe (use for high-frequency signals like scroll). */
  skipDedupe?: boolean;
  /** QA-simulated event — tagged classification='qa', excluded from Clean. */
  qa?: boolean;
}): void {
  try {
    const env = envelope({
      event_source: 'user_click',
      source_component: opts.source_component,
      product_id: opts.product_id ?? null,
      event: opts.event_name,
    });
    if (env.is_bot && !opts.qa) return;
    if (!opts.skipDedupe && env.deduped && !opts.qa) return;
    // Reserve the 10s bucket only when this row is actually going to insert
    // and is subject to dedupe (skipDedupe events like scroll milestones must
    // never block a subsequent real event in the same bucket).
    if (!opts.skipDedupe && !opts.qa) markDeduped(env.idempotency_key);

    const last = getLastTouch() ?? classifySource();
    const first = getFirstTouch() ?? last;

    insertLpEvent({
      session_id: env.session_id,
      event_name: opts.event_name,
      page_path: typeof window !== 'undefined' ? window.location.pathname : null,
      product_id: opts.product_id ?? null,
      product_name: opts.product_name ?? null,
      value: opts.value ?? null,
      utm_source: last.source,
      utm_medium: last.medium,
      utm_campaign: last.campaign,
      event_source: env.event_source,
      user_action_id: env.user_action_id,
      idempotency_key: opts.skipDedupe ? null : env.idempotency_key,
      source_component: env.source_component,
      is_bot: env.is_bot,
      bot_reason: env.bot_reason,
      geo_quality: env.geo_quality,
      traffic_quality_score: env.traffic_quality_score,
      deduped: false,
      validation_status: 'verified',
      ...qualityFields(env),
      ...(opts.qa ? { classification: 'qa', qa: true } : { qa: false }),
      raw_payload: {
        device_type: detectDeviceType(),
        os: detectOs(),
        first_touch: first,
        last_touch: last,
        ...(opts.extra ?? {}),
      },
    });
  } catch (e) {
    console.debug('[funnelEvents] fireLpEvent threw:', e);
  }
}

/** PDP loaded + visible to the user. Fires once per (session, product). */
export function firePdpView(input: {
  product_id: string;
  product_name?: string | null;
  price?: number | null;
  qa?: boolean;
}): void {
  // A real PDP view is a strong human-engagement signal. Mark the session
  // as verified so later ATC-and-later funnel events are exempt from the
  // impossible_timing bot heuristic.
  markEngagementVerified();
  fireLpEvent({
    event_name: 'pdp_view',
    source_component: 'pdp',
    product_id: input.product_id,
    product_name: input.product_name ?? null,
    value: input.price ?? null,
    qa: input.qa,
  });
  // GA4-canonical alias — surfaces in the CRO audit funnel under `view_item`.
  // Independent dedupe bucket because the event_name participates in the
  // idempotency hash inside fireLpEvent → envelope().
  fireLpEvent({
    event_name: 'view_item',
    source_component: 'pdp',
    product_id: input.product_id,
    product_name: input.product_name ?? null,
    value: input.price ?? null,
    qa: input.qa,
  });
}

/** Scroll-depth milestone (25/50/75/100). One row per milestone per session+page. */
export function fireScrollDepth(input: {
  product_id?: string | null;
  depth: 25 | 50 | 75 | 100;
  source_component?: string;
}): void {
  fireLpEvent({
    event_name: `scroll_depth_${input.depth}`,
    source_component: input.source_component ?? 'pdp',
    product_id: input.product_id ?? null,
    extra: { depth: input.depth },
  });
}

/** Image gallery interaction (swipe, zoom, click). */
export function fireImageInteraction(input: {
  product_id: string;
  interaction: 'swipe' | 'zoom' | 'click' | 'thumbnail';
  image_index?: number;
}): void {
  fireLpEvent({
    event_name: 'image_interaction',
    source_component: 'pdp_gallery',
    product_id: input.product_id,
    extra: { interaction: input.interaction, image_index: input.image_index ?? null },
  });
}

/** Cart drawer/page opened (distinct from add-to-cart). */
export function fireCartOpen(input: {
  item_count?: number;
  source_component?: string;
}): void {
  fireLpEvent({
    event_name: 'cart_open',
    source_component: input.source_component ?? 'cart_drawer',
    extra: { item_count: input.item_count ?? null },
  });
}

/** Payment success fired client-side from the success page only.
 * Reliable conversion truth still comes from Stripe webhooks — this is for
 * funnel-completion visibility in the admin dashboard only. */
export function firePaymentSuccess(input: {
  order_total?: number;
  currency?: string;
  stripe_session_id?: string;
}): void {
  fireLpEvent({
    event_name: 'payment_success',
    source_component: 'payment_success_page',
    value: input.order_total ?? null,
    extra: {
      currency: input.currency ?? 'USD',
      stripe_session_id: input.stripe_session_id ?? null,
    },
  });
}

/** Sticky add-to-cart bar became visible (engagement signal, not a click). */
export function fireStickyAtcView(input: { product_id?: string | null; source_component?: string }): void {
  fireLpEvent({
    event_name: 'sticky_atc_visible',
    source_component: input.source_component ?? 'pdp_sticky_cta',
    product_id: input.product_id ?? null,
  });
}

/**
 * Sticky add-to-cart bar was CLICKED. Fired from the button's click handler
 * BEFORE the CartContext.addItem call, so we can measure impression→click
 * separately from add_to_cart insert success.
 */
export function fireStickyAtcClick(input: {
  product_id?: string | null;
  source_component?: string;
}): void {
  fireLpEvent({
    event_name: 'sticky_atc_click',
    source_component: input.source_component ?? 'pdp_sticky_cta',
    product_id: input.product_id ?? null,
  });
}

/**
 * Cart was hydrated from localStorage on session bootstrap (returning
 * visitor). Distinguishes "user came back with items" from an in-session
 * add_to_cart, so `view_cart` without ATC is no longer a phantom funnel gap.
 * Fire ONCE per session (dedupe via 10s bucket + session-scoped guard).
 */
export function fireCartRestored(input: {
  item_count: number;
  cart_value?: number | null;
}): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (sessionStorage.getItem('gp_cart_restored_fired') === '1') return;
      sessionStorage.setItem('gp_cart_restored_fired', '1');
    }
  } catch { /* ignore */ }
  fireLpEvent({
    event_name: 'cart_restored',
    source_component: 'cart_bootstrap',
    value: input.cart_value ?? null,
    extra: { item_count: input.item_count },
  });
}

/** Rage click — ≥3 clicks within 800ms on the same target. */
export function fireRageClick(input: {
  product_id?: string | null;
  target_selector?: string;
}): void {
  fireLpEvent({
    event_name: 'rage_click',
    source_component: 'pdp',
    product_id: input.product_id ?? null,
    extra: { target_selector: input.target_selector ?? null },
    skipDedupe: true,
  });
}

/** Return visit — same session_id reused across days, or visitor_id from localStorage. */
export function fireReturnVisit(input: { visit_count: number }): void {
  fireLpEvent({
    event_name: 'return_visit',
    source_component: 'session_bootstrap',
    extra: { visit_count: input.visit_count },
  });
}

/** Session-end signal — dwell time + bounce classification.
 * Fired from beforeunload / visibilitychange with sendBeacon-friendly insert. */
export function fireSessionEnd(input: {
  dwell_ms: number;
  page_views: number;
  interactions: number;
  /** True when dwell<10s and interactions<2 (heuristic). */
  bounced: boolean;
  exit_page?: string;
}): void {
  fireLpEvent({
    event_name: input.bounced ? 'session_bounce' : 'session_end',
    source_component: 'session_lifecycle',
    value: input.dwell_ms,
    skipDedupe: true,
    extra: {
      dwell_ms: input.dwell_ms,
      page_views: input.page_views,
      interactions: input.interactions,
      bounced: input.bounced,
      exit_page: input.exit_page ?? (typeof window !== 'undefined' ? window.location.pathname : null),
    },
  });
}

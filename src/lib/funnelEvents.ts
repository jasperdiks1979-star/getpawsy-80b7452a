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
import { getBotClassification, recordEventTimingSample } from '@/lib/botDetection';
import { getFirstTouch, getLastTouch, classifySource } from '@/lib/attribution';

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
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `anon_${Date.now()}`;
  }
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

function isDuplicate(key: string): boolean {
  try {
    const fullKey = DEDUPE_PREFIX + key;
    if (sessionStorage.getItem(fullKey)) return true;
    sessionStorage.setItem(fullKey, String(Date.now()));
    return false;
  } catch {
    return false;
  }
}

function getGeoQuality(): string {
  try {
    const cached = sessionStorage.getItem('gp_geo_quality_v1');
    if (cached) return cached;
  } catch {
    /* ignore */
  }
  return 'unknown';
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
} {
  recordEventTimingSample();
  const sessionId = getSessionId();
  const cls = getBotClassification();
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
    deduped: isDuplicate(key),
  };
}

export interface UserAddToCartInput {
  product_id: string;
  product_name?: string | null;
  variant_id?: string | null;
  qty: number;
  price: number;
  currency?: string;
  source_component: string; // e.g. 'pdp_sticky_cta', 'cart_drawer', 'pdp_main_cta'
}

/**
 * Fire a REAL user-click add-to-cart event. Caller MUST be inside a user
 * click handler — never fire from mount, hydration, or sticky-sync effects.
 */
export function fireUserAddToCart(input: UserAddToCartInput): void {
  try {
    const env = envelope({
      event_source: 'user_click',
      source_component: input.source_component,
      product_id: input.product_id,
      variant_id: input.variant_id ?? null,
      event: 'add_to_cart',
    });
    if (env.is_bot) return; // never count bot ATC
    if (env.deduped) return; // collapsed inside 10s window

    const last = getLastTouch() ?? classifySource();
    const first = getFirstTouch() ?? last;

    const row: Record<string, unknown> = {
      session_id: env.session_id,
      event_name: 'add_to_cart',
      page_path: typeof window !== 'undefined' ? window.location.pathname : null,
      product_id: input.product_id,
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
      validation_status: 'verified',
      raw_payload: {
        qty: input.qty,
        price: input.price,
        currency: input.currency ?? 'USD',
        first_touch: first,
        last_touch: last,
      },
    };
    void supabase.from('lp_funnel_events').insert(row as never).then(({ error }) => {
      if (error && error.code !== '23505') {
        console.debug('[funnelEvents] ATC insert failed:', error.message);
      }
    });
  } catch (e) {
    console.debug('[funnelEvents] fireUserAddToCart threw:', e);
  }
}

export interface CheckoutEventInput {
  step: 'checkout_click' | 'checkout_redirect_attempt' | 'checkout_redirect_success' | 'checkout_error';
  source_component: string;
  cart_id?: string | null;
  item_count?: number | null;
  value?: number | null;
  currency?: string;
  destination_url?: string | null;
  error_reason?: string | null;
}

export function fireCheckoutEvent(input: CheckoutEventInput): void {
  try {
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
    if (env.is_bot) {
      console.warn('[funnel:checkout] skipped — is_bot', {
        step: input.step,
        bot_reason: env.bot_reason,
      });
      return;
    }
    if (env.deduped && input.step === 'checkout_click') {
      console.warn('[funnel:checkout] skipped — deduped (idempotency window)', {
        step: input.step,
        idempotency_key: env.idempotency_key,
      });
      return;
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

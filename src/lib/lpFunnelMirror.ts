/**
 * lpFunnelMirror — best-effort mirror of the TikTok bio funnel events
 * into Postgres so the admin dashboard can compute drop-off rates that
 * GA4 alone cannot reliably surface (sampling, ad-blockers, consent).
 *
 * Only a curated subset of events is mirrored — anything else stays in
 * GA4 only. Failures are swallowed: analytics must never break the UX.
 */
import { supabase } from '@/integrations/supabase/client';
import { getFounderModeStatus } from '@/lib/founder-mode';
import { getVisitorCohort } from '@/lib/visitorCohort';
import { sanitizeTrackingFields, cleanString, isBotUserAgent } from '@/lib/eventSanitizer';
import { getDeviceClassification } from '@/lib/deviceClassify';
import { getCachedUsTier, getCachedGeoCountry } from '@/lib/geoClassify';
import { getPersistedUtm } from '@/lib/utmNormalizer';
import { getStoredUTMParams } from '@/hooks/useUTMTracking';

const LANDING_PAGE_KEY = 'gp_landing_page';

function getLandingPage(): string | null {
  try {
    const store = window.sessionStorage;
    let lp = store.getItem(LANDING_PAGE_KEY);
    if (!lp) {
      const stored = getStoredUTMParams();
      lp = stored.landing_page ?? (window.location.pathname + window.location.search);
      store.setItem(LANDING_PAGE_KEY, lp);
    }
    return lp.slice(0, 500);
  } catch {
    return null;
  }
}

const MIRRORED_EVENTS = new Set([
  'lp_view',
  'lp_cta_impression',
  'lp_cta_click',
  'lp_cta_repeat_click',
  'lp_cta_misclick',
  // Mirrored so the admin CTA dashboard can attribute outbound deep-link
  // clicks (raw `<TikTokDeepLinkButton>` clicks) per placement × variant
  // — complementary to lp_cta_click which fires on the higher-level wrapper.
  'tiktok_deep_link_click',
  'view_item',
  'add_to_cart',
  // Full ecommerce funnel mirror — required for the per-source funnel
  // dashboard (FunnelBySourcePage) to compute view_item → add_to_cart →
  // begin_checkout → purchase conversion per UTM source (TikTok, Pinterest…).
  'begin_checkout',
  'purchase',
  // TikTok PDP variant instrumentation — mirrored so the 72h measurement
  // phase can compute buy-box visibility, first-interaction latency and
  // ATC / Buy Now rates server-side from lp_funnel_events.
  'tiktok_pdp_buy_box_visible',
  'tiktok_first_interaction',
  'tiktok_atc_click',
  'tiktok_buy_now_click',
]);

const SESSION_ID_KEY = 'gp_session_id';

function getSessionId(): string {
  try {
    const store = window.sessionStorage;
    let id = store.getItem(SESSION_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      store.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return `anon_${Date.now()}`;
  }
}

function pickString(params: Record<string, unknown> | undefined, key: string): string | null {
  const value = params?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function pickNumber(params: Record<string, unknown> | undefined, key: string): number | null {
  const value = params?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pickInt(params: Record<string, unknown> | undefined, key: string): number | null {
  const v = pickNumber(params, key);
  return v == null ? null : Math.round(v);
}

function pickBool(params: Record<string, unknown> | undefined, key: string): boolean | null {
  const value = params?.[key];
  return typeof value === 'boolean' ? value : null;
}

function pickProductFromItems(params: Record<string, unknown> | undefined): {
  product_id: string | null;
  product_name: string | null;
} {
  const items = params?.items;
  if (!Array.isArray(items) || items.length === 0) return { product_id: null, product_name: null };
  const first = items[0] as Record<string, unknown>;
  return {
    product_id: typeof first?.item_id === 'string' ? (first.item_id as string) : null,
    product_name: typeof first?.item_name === 'string' ? (first.item_name as string) : null,
  };
}

/** Fire-and-forget mirror. Never throws, never blocks the caller. */
export function mirrorLpFunnelEvent(
  eventName: string,
  params?: Record<string, unknown>,
): void {
  if (!MIRRORED_EVENTS.has(eventName)) return;
  if (typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && isBotUserAgent(navigator.userAgent)) return;

  const isInternal = getFounderModeStatus();
  const { product_id, product_name } = pickProductFromItems(params);

  const clean = sanitizeTrackingFields({
    page_path: pickString(params, 'page') || window.location.pathname,
    utm_source: pickString(params, 'utm_source'),
    utm_medium: pickString(params, 'utm_medium'),
    utm_campaign: pickString(params, 'utm_campaign'),
    utm_content: pickString(params, 'utm_content'),
  });
  if (!clean.page_path) return; // drop spam

  // Attribution back-fill. If the caller didn't carry UTMs on the event
  // (legacy view_item, organic landings, deferred conversion events), pull
  // them from the persisted session/localStorage attribution layer so every
  // mirrored row has a usable utm_source / utm_medium / utm_campaign when
  // data exists. This is what closes the TikTok / Pinterest / Google Ads
  // attribution gap in lp_funnel_events.
  const persisted = getPersistedUtm();
  const utm_source = clean.utm_source ?? persisted.utm_source ?? null;
  const utm_medium = clean.utm_medium ?? persisted.utm_medium ?? null;
  const utm_campaign = clean.utm_campaign ?? persisted.utm_campaign ?? null;
  const utm_content = clean.utm_content ?? persisted.utm_content ?? null;
  const utm_term = pickString(params, 'utm_term') ?? persisted.utm_term ?? null;

  // Validation: reject NULL attribution when data IS available. We don't
  // drop the row — that would lose the event — but we log a structured
  // warning so the dashboard's coverage report can surface regressions.
  if (!utm_source && !utm_medium && !utm_campaign) {
    const hasReferrer = typeof document !== 'undefined' && !!document.referrer;
    const hasUrlUtm = typeof window !== 'undefined' && /[?&]utm_/.test(window.location.search);
    if (hasReferrer || hasUrlUtm) {
      console.warn('[lpFunnelMirror] NULL attribution despite available signal', {
        event: eventName,
        page: clean.page_path,
        referrer: typeof document !== 'undefined' ? document.referrer : null,
        search: typeof window !== 'undefined' ? window.location.search : null,
      });
    }
  }

  const dev = getDeviceClassification();

  const row = {
    session_id: getSessionId(),
    event_name: eventName,
    placement: cleanString(pickString(params, 'placement'), 120),
    page_path: clean.page_path,
    product_id: cleanString(product_id || pickString(params, 'product_id'), 120),
    product_name: cleanString(product_name, 240),
    value: pickNumber(params, 'value'),
    lp_click_id: cleanString(pickString(params, 'lp_click_id'), 200),
    lp_placement: cleanString(pickString(params, 'lp_placement'), 120),
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    funnel: cleanString(pickString(params, 'funnel'), 60) ?? 'tiktok_bio',
    // Envelope enrichment — device / browser / geo. Required so the legacy
    // view_item path no longer writes NULL for these columns (which broke
    // the "US-only" and "mobile vs desktop" segments in the dashboards).
    device: dev.device,
    os_family: dev.os_family,
    browser_family: dev.browser_family,
    in_app_browser: dev.in_app_browser,
    geo_country: getCachedGeoCountry(),
    geo_tier: getCachedUsTier(),
    landing_page: getLandingPage(),
    // CTA variant tag — flows through from LinkInBio's CTA_VARIANT constant
    // (currently 'high_conv_v2'). Lets the admin dashboard compare CTR per
    // variant × placement to attribute uplift to specific UI experiments.
    cta_variant: pickString(params, 'cta_variant'),
    // Auto-winner attribution. `cta_copy_label` is the registry key (e.g.
    // 'claim_limited') chosen by the elector for this (placement, mode);
    // `cta_copy_mode` is 'calm' (pre-urgency) or 'urgent' (post-60% scroll).
    // Both are NULL on events that don't carry copy variants (video, proof,
    // nudge, arrow, etc.) so the elector's GROUP BY skips them naturally.
    cta_copy_label: pickString(params, 'cta_copy_label'),
    cta_copy_mode: pickString(params, 'cta_copy_mode'),
    // Phase 23/24 — cohort attribution. `hook_family` is the visitor's
    // resolved cohort (smell_pain / time_pain / direct_buyer / …);
    // `cta_copy_source` is 'cohort' | 'elected' | 'default' depending on
    // whether the displayed copy came from the hook-family preference,
    // the auto-elected winner, or the build-time fallback.
    hook_family: pickString(params, 'hook_family'),
    cta_copy_source: pickString(params, 'cta_copy_source'),
    is_internal: isInternal,
    // Visitor cohort — 'first_session' (cold TikTok traffic, no prior visit)
    // vs 'returning'. Lets us segment heatmaps and CTR by cohort to see
    // whether returning users behave fundamentally differently.
    cohort: getVisitorCohort(),
    // Per-placement timing + first-click attribution. These columns power the
    // /admin/placement-overview dashboard (CTR, time-to-visible, time-to-click,
    // first-click winner). Null on events that don't carry these params.
    time_to_visible_ms: pickInt(params, 'time_to_visible_ms'),
    time_to_click_ms: pickInt(params, 'time_to_click_ms'),
    dwell_ms: pickInt(params, 'dwell_ms'),
    scroll_depth_at_visible: pickInt(params, 'scroll_depth_at_visible'),
    scroll_depth_at_click: pickInt(params, 'scroll_depth_at_click'),
    is_first_click: pickBool(params, 'is_first_click'),
    first_click_placement: pickString(params, 'first_click_placement'),
    // Misclick / repeat-click classification (see LinkInBio.tsx). These are
    // present on lp_cta_click rows AND on the dedicated lp_cta_misclick /
    // lp_cta_repeat_click rows so the admin overview can compute rates with
    // a single GROUP BY against the click stream.
    is_misclick: pickBool(params, 'is_misclick'),
    is_repeat_click: pickBool(params, 'is_repeat_click'),
    repeat_index: pickInt(params, 'repeat_index'),
    previous_placement: pickString(params, 'previous_placement'),
    delta_ms: pickInt(params, 'delta_ms'),
  };

  // Fire-and-forget — analytics must never affect the user experience.
  void supabase
    .from('lp_funnel_events')
    .insert(row)
    .then(({ error }) => {
      if (error) console.debug('[lpFunnelMirror] insert failed:', error.message);
    });
}
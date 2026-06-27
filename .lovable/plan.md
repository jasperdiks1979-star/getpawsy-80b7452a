# Analytics Gold Standard — Implementation Plan

Scope: make analytics trustworthy without changing any existing tracking behaviour. All new tables/events are additive. Existing dashboards keep working; new ones are added.

## Phase A — Foundation (DB + classification)

1. **New tables** (additive, RLS locked to admin):
   - `analytics_engagement_starts` — canonical "true human visit" event.
   - `analytics_traffic_classification` — one row per session with `traffic_type` (human/prefetch/prerender/crawler/bot/internal), reason, UA, headers signature.
   - `analytics_funnel_waterfall` — denormalised per-session timeline (click→purchase) with timestamps + drop-off flags.
   - `analytics_session_quality` — score 0–100 + classification (Bot/Accidental/Bounce/Interested/Shopping/HighIntent/Buyer) + signal breakdown.
   - `analytics_geo_quality` — provider_used, lookup_ms, fallback_level, confidence (High/Med/Low/Unknown).
   - `analytics_health_checks` — minute-by-minute status per probe.
   - `analytics_alerts` — open/closed alerts + suggested fix.
   - `analytics_daily_validation` — nightly totals snapshot.

2. **Classification rules** (frontend + edge):
   - Bot/crawler: UA regex (Googlebot, Bingbot, facebookexternalhit, Pinterestbot, TikTokBot, AhrefsBot, Cloudflare-Healthcheck, etc.).
   - Prerender: `document.prerendering`, `navigation.type === 'prerender'`, `Sec-Purpose: prefetch;prerender`.
   - Prefetch: `Sec-Purpose: prefetch`, `Purpose: prefetch`, `X-Moz: prefetch`, `X-Purpose`.
   - Internal: admin IP allowlist + authed admin role.
   - Human: passes engagement_start gate (DOM ready + visible + ≥2s active + not above).

## Phase B — Engagement Start event

- New module `src/lib/engagementStart.ts`:
  - Waits for `DOMContentLoaded`, then `requestIdleCallback`.
  - Verifies `visibilityState==='visible'`, not prerendering, no prefetch hints, not bot, then arms a 2 000 ms visible-only timer (paused on `visibilitychange`).
  - On fire: POSTs to new edge function `analytics-engagement-start` with session_id, visitor_id, UTM cluster (incl. ttclid/fbclid/gclid), landing_page, device, browser, country (from existing geo hook), timestamp.
- Wired from `SafeGlobalVisitorTracker` once per session (dedup via sessionStorage key `gp_engagement_started`).
- Existing `page_view`/visitor_activity writes are NOT changed.

## Phase C — Funnel waterfall

- Edge function `analytics-funnel-ingest`: accepts step events (`click,redirect,landing,engagement_start,page_view,scroll,view_item,add_to_cart,begin_checkout,payment,purchase`) and upserts row in `analytics_funnel_waterfall` keyed by session_id.
- Hook into existing emitters (`funnelEvents.ts`, `/go` redirect log, checkout events) — additive listeners, no behaviour change.
- Drop-off computed in a SQL view `analytics_funnel_dropoff_v` (no writes).

## Phase D — Session Quality score

- Client collector `src/lib/sessionQuality.ts` aggregates: time-on-page, max scroll %, mouse/touch counts, product/cart/checkout interactions, visibility ratio, page count, return-visit flag (localStorage).
- Flushed every 15s + on `visibilitychange:hidden` to edge function `analytics-session-quality` which computes score + classification server-side (deterministic formula documented in function header).

## Phase E — Admin pages (new routes, lazy)

- `/admin/analytics-health` — grid of probes (auto-refresh 60s), green/yellow/red, last success, avg latency, failure reason, suggested fix. Backed by `analytics-health-probe` edge function called from cron every minute.
- `/admin/attribution-compare` — side-by-side table: TikTok / GA4 / Server / VisitorActivity / Pinterest / Meta × Clicks/LPV/PV/EngagementStart/Sessions/ATC/Checkout/Purchase. Discrepancies >10% highlighted.
- `/admin/visitor-timeline/:sessionId` — chronological list of all events for a session (click → purchase).
- Global **Traffic filter toggle** component (Human Only default; All / Bots / Prefetch / Crawler) — persisted in `localStorage`, consumed by VisitorWorldMap, CRO Command Center, Funnel views.

## Phase F — Alerts + Nightly validation

- Edge function `analytics-alert-evaluator` (cron every 5 min): checks rules from spec; inserts into `analytics_alerts`; surfaces in Health page + existing Commander alert bell.
- Edge function `analytics-daily-validation` (cron 02:30 UTC): aggregates totals into `analytics_daily_validation`, writes markdown report to `public/admin-reports/analytics/`.

## Phase G — Performance guard

- New scripts are dynamic-imported after `requestIdleCallback`; no synchronous network on critical path; engagement_start uses `navigator.sendBeacon` where possible; no new render-blocking CSS/JS; Lighthouse CWV smoke test in repo unchanged.

## Out of scope / not touched

- Existing GA4/TikTok/Meta/Pinterest pixel firing logic.
- Existing `visitor_activity`, `lp_funnel_events`, `checkout_funnel_events` writers.
- Existing CRO dashboard, World Map (only adds filter consumption).
- No schema changes to existing tables.

## Technical details

- 8 new tables, all `service_role` full + `authenticated` SELECT gated by `has_role(auth.uid(),'admin')`. No `anon` access.
- 6 new edge functions (`analytics-engagement-start`, `analytics-funnel-ingest`, `analytics-session-quality`, `analytics-health-probe`, `analytics-alert-evaluator`, `analytics-daily-validation`). `verify_jwt=false` for ingest endpoints (visitor-side), JWT-verified for admin reads.
- 3 cron jobs via `pg_cron`/`pg_net`: health (1 min), alerts (5 min), validation (daily 02:30).
- New routes lazy-loaded under existing admin shell; added to AdminNav.
- Bundle impact target: <8 KB gzipped on critical path (engagement_start collector inlined, rest dynamic-imported).

## Rollout

1. Migration (tables + RLS + grants).
2. Edge functions + crons.
3. Client collectors (feature-flagged via `app_config.analytics_gold_enabled`, default true after smoke).
4. Admin pages + nav entries.
5. 24-hour observation, then announce.

Approve to proceed.
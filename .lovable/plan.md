# Analytics Traffic Classification Rebuild (Phased)

The forensic audit proved the current dashboard treats crawlers, Lovable previews and verifiers as US/desktop/direct humans. Fixing all 16 sections of your brief in one turn is not safe — it spans schema, views, ~15 edge functions, the tracker script, retention policy, dashboard UI, tests and a 30-day historical reclass. Doing it as one shipped diff would almost certainly break canonical ingest or the dashboard.

Below is the phased plan. Each phase is independently deployable and reversible. **Nothing ships until you approve.**

## Phase 1 — Kill the US fallback and the "direct" default (schema + views only)

Goal: stop the lie at the read layer. Zero write-path changes, zero data mutation.

- New SQL function `public.normalize_country(text)` → returns `Unknown` for `NULL`/`''`/`'??'`; passes through real ISO/name values; maps `US/USA/United States` → `United States`, `NL` → `Netherlands`, etc.
- New SQL function `public.classify_channel_v2(referrer, utm_source, user_agent, query, headers jsonb, has_js_evidence bool)` implementing the 12-step ordered classifier from §2.
- Rewrite the 12 canonical views (`canonical_sessions_traffic_class`, `canonical_sources`, `canonical_kpis_hourly`, `canonical_funnel`, `canonical_traffic_class_funnel_24h`, `canonical_products`, `canonical_orders`, `canonical_revenue`, `canonical_attribution`, `canonical_heatmap`, `analytics_funnel_dropoff_v`, `canonical_sessions_traffic_class_summary_7d`) to:
  - call `normalize_country()` — never coerce NULL to US
  - call `classify_channel_v2()` — never fall back to `direct` when signals are missing (use `unknown`)
  - expose new columns: `traffic_class`, `is_internal`, `exclude_from_commercial`, `classification_reason`, `classifier_version = 'v2'`
- `analytics-canonical` edge function: remove the `geo='US'` implicit filter comments (already noted), add `traffic_class` filter param, default commercial responses to `HUMAN_CONFIRMED + HUMAN_PROBABLE`.

Regression tests (Deno + Vitest): the 15 test cases from §14, plus the 5 country cases from §1.

## Phase 2 — Signed internal-automation headers (write path, code-controlled traffic)

- New shared helper `supabase/functions/_shared/internal-fetch.ts` that wraps `fetch` with `X-GetPawsy-Automation: <worker>` + `X-GetPawsy-Internal: true` + HMAC signature (`INTERNAL_TRAFFIC_SIGNING_SECRET`).
- Update the ~7 internal callers that hit our own storefront: `pinterest-verify-worker`, `pinterest-cron-worker` (verify leg), `pinterest-track`, `canonical-health-check`, `analytics-health-probe`, `monitoring-tracking-heartbeat`, `pinterest-flow-monitor`.
- Update `canonical-ingest` and the storefront edge/middleware that produces `canonical_events` to:
  - verify the signature → set `is_internal=true`, `traffic_class='internal_automation'`, `automation_source=<worker>`, `exclude_from_commercial=true`
  - never write these rows into the human-facing views

New secret required: `INTERNAL_TRAFFIC_SIGNING_SECRET` (I'll request it via `add_secret` at the start of Phase 2).

## Phase 3 — Client telemetry expansion (privacy-conscious)

Update the storefront tracker (in `src/lib/analytics/*` and the ingest endpoint):

- Add: `viewport_w/h`, `screen_w/h`, `timezone`, `platform`, `browser_major`, `sec_purpose`, `document_visibility`, `navigation_type`, `has_scroll`, `has_pointer`, `has_keyboard`, `visible_ms`, `js_executed=true` beacon.
- Server side: hash IP (`sha256(ip + daily_salt)`), resolve ASN via existing geo table if present else NULL, drop raw IP after ingest.
- Schema: `ALTER TABLE canonical_events` + `canonical_sessions` to add nullable columns above + `classifier_version`, `traffic_class`, `is_internal`, `exclude_from_commercial`, `classification_reason`, `automation_source`, `bot_name`, `bot_family`, `bot_confidence`, `ip_hash`, `asn`.
- Retention: `ip_hash` kept 30d, raw UA kept 90d, then daily job scrubs.

## Phase 4 — Bot + frozen-UA detection

- Server-side classifier upgraded to detect:
  - Googlebot, Bingbot, Pinterestbot, AhrefsBot, SemrushBot, DuckDuckBot, UptimeRobot, Pingdom, StatusCake, headless-Chrome, Puppeteer, Playwright (`HeadlessChrome`, `sec-ch-ua` mismatches).
  - Reverse-DNS verification for Googlebot/Bingbot/Pinterestbot when we have IP.
  - **Frozen-UA anomaly**: rolling 24h window; if `count(UA) > 50 AND distinct_visitor_ids > 20 AND all sessions <1s with no interaction` → `BOT_PROBABLE, reason='frozen_ua_pattern'`. Runs in the ingest function against a small in-memory cache + a daily materialized aggregate.
- Non-page routes: hard exclude `/api/*`, `/api/img/*`, `/healthz*`, `/*.map`, `/robots.txt`, `/sitemap*.xml`, `/favicon.*` from `CANONICAL_PAGE_VIEW` at the tracker level and re-assert at ingest.

## Phase 5 — Historical reclassification (immutable raw preserved)

- New table `canonical_session_classifications_v2` (session_id, traffic_class, is_internal, confidence, reason, classifier_version, reclassified_at). Raw `canonical_events` untouched.
- Backfill job: iterate last 30d of sessions using stored telemetry from Phase 3 columns; where telemetry is missing → `UNKNOWN` (never `HUMAN`, never `US`, never `direct`).
- Views join to v2 classifications and prefer them over row-level v1 columns.

## Phase 6 — Dashboard split

- `src/pages/admin/Analytics*` (and the Visitor World Map V2 already governed by mem): three visually separated blocks per §13:
  1. **Commercial** — HUMAN_CONFIRMED only by default, toggle to include HUMAN_PROBABLE.
  2. **Traffic quality** — stacked bar: human / internal / bots / verifiers / unknown.
  3. **Technical observability** — raw crawler / verifier / preview / uptime counts.
- Conversion-rate denominator switched to human sessions only. Country pie chart uses `normalize_country()`.

## Phase 7 — Controlled verification matrix

Run 8 synthetic requests (Bingbot UA, Lovable preview URL, signed automation, `/api/img`, real headless with all telemetry, etc.) and assert each lands in the expected `traffic_class`. Zero fake Pinterest clicks or public engagement.

## Technical details

- Migrations: schema-only, additive (new columns nullable, new tables, new functions, new views recreated with `CREATE OR REPLACE`). No destructive changes; the `analytics_traffic_classification` and `canonical_sessions_traffic_class` v1 outputs stay readable for one release cycle.
- Feature flag `ANALYTICS_CLASSIFIER_V2_ENABLED` on the ingest function so Phase 2–4 can dark-launch.
- Tests: `supabase/functions/_shared/traffic-classifier-v2.test.ts` (Deno) + `src/lib/analytics/__tests__/classifierV2.test.ts` (Vitest) covering all 15 §14 cases.
- Rollback per phase: `DROP FUNCTION classify_channel_v2`, revert view definitions from git — no data loss because raw `canonical_events` is never mutated.

## Recommended execution order

Phase 1 → Phase 3 (write-path telemetry needs to exist before Phase 4 can lean on it) → Phase 4 → Phase 2 → Phase 5 → Phase 6 → Phase 7.

Reply **"go phase 1"** to start (schema/view fixes + tests only, zero write-path or dashboard risk), or **"go all phases sequentially"** to authorize the whole sequence (I'll pause between phases for review), or name any subset.
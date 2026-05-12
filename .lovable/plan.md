## Compliance-First Growth Intelligence Engine

Self-learning groei-systeem dat US-traffic, content, producten en conversies meet over Pinterest, TikTok, Google (GA4 + GSC + Merchant) en de webshop, en op basis daarvan compliant creatives genereert, scoort, en (afhankelijk van autopilot-modus) als draft of automatisch publiceert. **Default = DRAFT_ONLY**, US-only filter overal afgedwongen.

Bestaande systemen blijven intact en worden hergebruikt:
- `pinterest_pin_queue` + `pinterest-creative-director` (image pins)
- `pinterest_video_publisher` (video pins)
- TikTok generator stack
- `visitor_activity`, `orders`, `products` (US-attributie bron)
- `/admin/profit-engine` (Pinterest break-even)

Het nieuwe systeem **wraps** deze stacks via één gedeelde data-laag, scoring-engine, compliance-check en dashboard. Het vervangt niets.

---

## Phase 1 — Foundation (start hier, na akkoord)

**Doel:** schema + US-only views + admin skeleton + CSV import + interne rollups. Bouwt zonder externe API's, levert direct werkende dashboards op echte shop-data.

### 1.1 Database (één migration)
Nieuwe tabellen (alle met RLS, admin-only schrijven, admin-only lezen):
- `gi_traffic_sessions` — geunificeerde sessies (source/medium/campaign/content, country, device, landing_page, session_id, is_us, is_internal, started_at)
- `gi_attribution_events` — events per sessie (view, click, outbound, atc, checkout, purchase, revenue_cents)
- `gi_social_content_items` — registry van pins/video's (channel, external_id, product_slug, hook_family, asset_url, fingerprint)
- `gi_pinterest_pin_metrics` — daily snapshots per pin (impressions, saves, outbound, ctr)
- `gi_tiktok_video_metrics` — daily snapshots per video
- `gi_gsc_metrics` — daily query×page (impressions, clicks, ctr, position, country)
- `gi_ga4_events` — daily aggregaten per source/medium/page
- `gi_product_performance_daily` — per product/day (sessions_us, atc, purchases, revenue)
- `gi_creative_performance_daily` — per content_item/day
- `gi_channel_performance_daily` — per channel/day
- `gi_growth_decisions` — engine outputs (target_id, decision_type, score, rationale)
- `gi_automation_actions` — wat het systeem deed (action, target, autopilot_mode, status)
- `gi_compliance_review_log` — wat geblokkeerd/gewaarschuwd werd + reden
- `gi_settings` — singleton: autopilot_mode, market, allowlist countries, daily caps

US-only views (security_invoker, admin-readable):
- `us_traffic_sessions_v`, `us_attribution_events_v`, `us_product_performance_daily_v`, `us_creative_performance_daily_v`, `us_channel_performance_daily_v`

Filter overal: `country IN ('US','United States') AND is_internal = false AND NOT is_bot`.

### 1.2 Rollup edge function
- `gi-rollup-internal` — draait nightly via pg_cron, leest `visitor_activity` + `orders`, vult `gi_traffic_sessions/_events/_product_performance_daily/_channel_performance_daily`. US-only filter aan de bron.

### 1.3 Admin dashboard skeleton
Nieuwe route `/admin/growth-intelligence` (lazy-loaded, achter `AdminRouteGuard`). Tabs als shell met "coming soon" placeholders + counter-strip bovenaan:
- Total sessions / US included / non-US excluded / internal excluded / unknown excluded
- Banner als US sessions < drempel: *"Not enough US traffic yet for reliable decisions."*

Tabs:
1. Overview (werkt in Phase 1 — toont US shop performance)
2. Channel Performance (werkt — toont gi_channel_performance_daily)
3. Product Winners (werkt — toont gi_product_performance_daily)
4. Creative Winners (Phase 2)
5. Pinterest Intelligence (Phase 2)
6. TikTok Intelligence (Phase 2)
7. Google/SEO Intelligence (Phase 2)
8. Queue (Phase 3)
9. Compliance Review (Phase 3)
10. Decisions Log (Phase 2)
11. Autopilot Settings (werkt — read/write `gi_settings`, default DRAFT_ONLY)
12. API Health (werkt — Pinterest token check, cron last-run)
13. **Excluded Traffic** (diagnostics — non-US/internal/bot breakdown)

### 1.4 CSV import fallback
- `/admin/growth-intelligence/import` — drag-drop voor:
  - Pinterest analytics CSV → `gi_pinterest_pin_metrics`
  - TikTok analytics CSV → `gi_tiktok_video_metrics`
  - GSC export CSV → `gi_gsc_metrics`
  - GA4 export CSV → `gi_ga4_events`
- Edge function `gi-csv-import` valideert headers, dedupliceert op (date, external_id), retourneert `{ok, inserted, skipped, errors[]}`.

**Phase 1 deliverable:** werkend dashboard met echte US shop cijfers, alle tabellen klaar voor data van andere phases, CSV import werkt, autopilot staat op DRAFT_ONLY.

---

## Phase 2 — Connectors + Scoring

### 2.1 Pinterest connector (API live)
- `gi-pinterest-sync` — gebruikt bestaande `pinterest_accounts` token, haalt pin analytics op laatste 30 dagen, schrijft naar `gi_pinterest_pin_metrics` + linkt aan `gi_social_content_items`. Rate-limit aware.

### 2.2 TikTok / GA4 / GSC
- Voorlopig CSV-only (gebruiker heeft nog geen API credentials). UI maakt het 1-klik upload elke week.

### 2.3 Scoring engine
- `gi-score` edge function — berekent per content_item & product:
  - creative_score, hook_score, thumbnail_score, product_fit_score, channel_fit_score
  - conversion_probability (logistic op US ATC/purchase rates)
  - compliance_risk_score (zie 3.2)
  - saturation_score, duplicate_risk_score (op fingerprint + age)
  - traffic_quality_score (US %, returning %, bot %)
  - revenue_potential_score, confidence_score (n + recency)
- Schrijft naar `gi_growth_decisions` met decision_type ∈ {SCALE, REMIX, PAUSE, RETRY_WITH_NEW_HOOK, CREATE_VIDEO_VERSION, CREATE_IMAGE_PIN_VERSION, SEND_TO_MANUAL_REVIEW, DO_NOT_PUBLISH_COMPLIANCE_RISK}.

### 2.4 Dashboard tabs Pinterest/TikTok/SEO/Creative Winners/Decisions Log gaan live.

---

## Phase 3 — Creative generator queue + Compliance

### 3.1 Generator queue
- `gi-generator` schrijft drafts in bestaande queues:
  - Pinterest image pin → `pinterest_pin_queue` (status='draft')
  - Pinterest video → bestaande video publisher draft
  - TikTok → bestaande tiktok queue
- Nieuwe `gi_creative_drafts` tabel met: title, description, destination_url, product_slug, hook_family, cta, target_channel, asset_url, compliance_status, quality_score, mobile_safety_score, fingerprint, publish_status.

### 3.2 Compliance checker
- `gi-compliance-check` runt voor élke draft, vóór queueing:
  - regex/word-list voor fake scarcity, fake reviews, false guarantees, banned medical claims (hergebruik `mem://compliance/high-risk-marketing-terminology-policy`)
  - prijs/voorraad/URL-validatie tegen `products`
  - duplicate fingerprint check
  - mobile safe-area check (hergebruik Pinterest viral engine V2 logic)
  - rate-limit check tegen `gi_settings.daily_cap_per_channel`
- Output: `pass | warn | block` + `reason` + `suggested_rewrite`. Logged in `gi_compliance_review_log`.

---

## Phase 4 — Safe scheduler + Autopilot

- `gi-scheduler` cron checkt `gi_settings.autopilot_mode`:
  - OFF → niets
  - OBSERVE_ONLY → alleen scoren, niets queueen
  - DRAFT_ONLY (default) → drafts klaarzetten, geen publish
  - AUTO_QUEUE → schedule in queue tijd, nog steeds geen publish
  - AUTO_PUBLISH_CONSERVATIVE → publiceer alleen `confidence_score > 0.85` & compliance pass
  - AUTO_PUBLISH_BALANCED → `> 0.7`
- Daily caps + min gap (Pinterest 90min, TikTok 4u) via `gi_settings`.
- Alle acties → `gi_automation_actions`.

---

## Phase 5 — Landing page feedback loop

- `gi-lp-recommendations` — detecteert:
  - hoge traffic + lage CTR
  - hoge CTR + lage ATC
  - ATC zonder checkout
  - mobile drop-off
- Output: aanbeveling-records (geen auto-edit van public pages, tenzij admin toggle aanzet).

---

## Technische details

**Edge function contract** (per `mem://infrastructure/edge-function-and-api-standards`):
```json
{ "ok": true, "traceId": "...", "message": "...", "data": {...} }
```
Geen silent fails. Errors → `{ok:false, traceId, message, code, details}`.

**Security:**
- Alle `gi_*` tabellen RLS aan, alleen `has_role(auth.uid(), 'admin')` mag SELECT/INSERT/UPDATE.
- Edge functions valideren admin via `getClaims()` + `has_role` RPC.
- Tokens in `pinterest_accounts` (bestaand) — nooit client-side.
- `/admin/growth-intelligence/*` achter `AdminRouteGuard` + lazy-loaded.

**US-only enforcement:**
- View-niveau filter (single source of truth).
- Score functies querien alléén `us_*_v` views.
- Autopilot leest alleen US-views — non-US kan nooit een SCALE-beslissing triggeren.
- Counters tonen exclusion-breakdown live op dashboard.

**Compliance defaults:**
- `gi_settings.autopilot_mode = 'DRAFT_ONLY'`
- `gi_settings.market = 'US'`
- `gi_settings.country_allowlist = ['US','United States']`
- Pinterest daily_cap = 4 (matcht bestaande warm-up policy)
- TikTok daily_cap = 3

---

## Wat ik nu ga bouwen na jouw goedkeuring

**Alleen Phase 1.** Daarna laat ik je het dashboard zien met echte US-cijfers, en vraag akkoord voor Phase 2.

Phase 1 = 1 migration + 1 rollup edge function + 1 CSV import edge function + 1 dashboard route met 13 tabs (3 functioneel, 10 placeholders) + cron schedule.

Geschatte impact: ~14 nieuwe tabellen, ~5 views, 2 edge functions, 1 admin route, 0 wijzigingen aan bestaande pagina's.

Reageer met **"ga"** om Phase 1 te starten, of met aanpassingen op het plan.

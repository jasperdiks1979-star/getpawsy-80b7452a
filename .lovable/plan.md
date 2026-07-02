
# GENESIS Ω∞ — Customer Journey Intelligence Engine (CJIE)

Per Build Justification Directive: extend the existing canonical + attribution + CIE stack we shipped last turn. No new event pipeline, no duplicate dashboards, no synthetic data.

## Build Justification (4-point)

1. **Existing is insufficient because** `/admin/revenue-attribution-center` answers "which channel earned revenue" but cannot answer "why did THIS session leave without buying." `canonical_events` records the WHAT but has no per-session narrative, no abandonment root cause, no trust/checkout interaction breakdown.
2. **Revenue impact:** every abandoned session with an identified fixable root cause (price, shipping, trust, variant confusion, checkout error) is directly recoverable revenue. Today we recover 0% because we can't see the reason.
3. **Why not modify existing:** we ARE modifying existing — the CJIE lives on top of `canonical_events` / `canonical_sessions` / `analytics_session_quality` / `cie_journey_steps` (already exists, 10 cols). Only one new table (`cjie_session_journeys`) — the compact per-session narrative — because rebuilding the narrative from raw events on every dashboard load is too slow (>3s p95). All UI extends `/admin/revenue-attribution-center` as a "Journeys" tab + a focused `/admin/customer-journey-center` for the live-journey view (single new page).
4. **Measurable impact certified nightly:** Journey Completeness %, Behaviour Classification %, Abandonment Classification %, Trust Classification %, Prediction Accuracy %, Unknown Journey % — all SHA-256 signed into `genesis_perpetual_certifications` (existing table).

## What already exists (reused)

- `canonical_events` (29 cols) + `canonical_sessions` (now 45 cols with first-touch attribution)
- `analytics_session_quality` (now 27 cols with dead/rage/back/search/filter counters)
- `cie_journey_steps` (10 cols) — will store the ordered timeline
- `cci_events` — client behavioural events already flowing
- `checkout_funnel_events` (31 cols) — checkout timeline
- `revenue-attribution` edge function — extend, do not fork
- `first-sales-accelerator.nightlyAudit` — extend certification
- `gare-orchestrator` — reuse Detect→Diagnose→Repair loop for auto-fixes
- `genesis_perpetual_certifications` — signed evidence storage

## Extension Plan

### Phase 1 — Journey Timeline (extends `cie_journey_steps` + one new session-narrative table)

Single new table `cjie_session_journeys` (one row per session — the compact story):

```
session_id (pk)  visitor_id  first_seen  last_seen  duration_ms
page_count  event_count  product_ids[]  category_ids[]  collection_ids[]
searches[]  filters[]  clicks_json  entry_page  exit_page
device  browser  country  region  city  language  timezone  screen_wxh
returning_visitor  new_visitor  classified_channel (denorm)
intent_class  intent_confidence  abandonment_reason  abandonment_confidence
trust_interactions_json  checkout_interactions_json
predicted_purchase_prob  narrative_hash
built_at  built_from_events_at
```

Populated by a single deterministic SQL RPC `cjie_build_journeys(since timestamptz)` that reads only `canonical_events` + `checkout_funnel_events` + `analytics_session_quality` + `canonical_sessions`. No LLM, no synthesis — pure aggregation. Idempotent upsert on `session_id`.

### Phase 2 — Behavioural Intent Classifier (SQL, evidence-only)

Add `public.cjie_classify_intent(session_row jsonb) returns jsonb` returning `{class, confidence, evidence[]}`. Rules are evidence-based only:

- **Buyer** — has PURCHASE event
- **Checkout Hesitation** — reached CHECKOUT, no PURCHASE, checkout_exits > 0
- **Payment Failure** — has payment_redirect_started but no purchase, order status ≠ paid
- **Abandoned Cart** — has ATC, no PURCHASE, no checkout_exit
- **High Purchase Intent** — product_view_sessions ≥ 3, ATC or scroll > 75%
- **Comparison Shopper** — ≥ 3 distinct product_views + filter_uses ≥ 1
- **Research Visitor** — ≥ 2 product_views, no ATC, scroll ≥ 50%
- **Window Shopper** — 1 product_view, low scroll, no ATC
- **Returning Customer** — visitor_id seen in prior 30d with a purchase
- **Bot** — traffic_classification = bot/crawler
- **Low Intent / Unknown** — everything else with declared confidence

Never guess if evidence < threshold — class = `Unknown`, confidence set explicitly.

### Phase 3 — Abandonment Reason Classifier (SQL, evidence-only)

`public.cjie_classify_abandonment(session_row jsonb) returns jsonb`:

- **Out of Stock** — ATC failed with `stock_sync_status ≠ ok` or product marked out_of_stock at time of view
- **Variant Confusion** — variant_selections ≥ 3 with no ATC
- **Shipping** — visited shipping page after ATC, no purchase
- **Trust** — visited returns/guarantee/about after ATC, no purchase
- **Checkout** — checkout_exits ≥ 1
- **Payment** — payment_redirect_started, no purchase, no downstream event
- **Performance** — session_quality.time_to_interactive breach OR frontend_error_logs row
- **Technical Error** — frontend_error_logs row within session window
- **Price** — visited multiple product_views + coupon_attempts ≥ 1 + abandoned
- **Search Failure** — search_uses ≥ 1 with 0 subsequent product_views
- **Navigation** — page_count ≥ 5 with 0 product_views
- **No Reviews** — product_view without reviews-scroll event, abandoned
- **Tracking Loss** — session ended before events completed a stage
- **Unknown** — fallback with confidence

### Phase 4 — Product Journey Roll-up (extends `v_product_attribution_daily`)

Two new views:

- `v_product_journey_health` — per product: views, unique viewers, ATC rate, checkout rate, purchase rate, bounce rate, exit rate, avg viewing time, revenue, revenue_lost (est. from ATC-not-purchased × price), confidence.
- `v_journey_paths_top` — most common ordered page sequences that lead to purchase vs abandonment (aggregated hash of first 8 canonical stages per session).

### Phase 5 — Trust Intelligence (extends `cci_events`)

Add client emitters (single small file, `src/lib/trust-signals.ts`) that fire `trust_element_viewed` events with `element_type ∈ {reviews, return_policy, shipping_policy, guarantee, about, contact, faq, security_badge, payment_logo}` when the corresponding section becomes visible (IntersectionObserver, ≥50% visible for ≥1s). Wired on PDP, cart, checkout — no new pages. Aggregation: `v_trust_element_correlation` — purchases-with vs purchases-without each trust interaction.

### Phase 6 — Navigation Intelligence

View `v_navigation_intelligence`: entry-page frequency, exit-page frequency, longest/shortest journeys, pages-always-before-purchase (support ≥ 20%), pages-causing-abandonment (drop-off > 60%).

### Phase 7 — Checkout Intelligence (extends `checkout_funnel_events`)

View `v_checkout_intelligence`: cart_open, cart_edit, quantity_change, coupon_attempt, shipping_select, payment_select, wallet_click, checkout_abandon_ts, avg checkout duration, avg hesitation between steps. Client emitters extended in `CartContext.tsx` + `PaymentSuccess.tsx` for the missing step names.

### Phase 8 — /admin/customer-journey-center (ONE new page)

Single new admin page. Reads exclusively from `cjie_session_journeys` + the views above.

Layout:

```text
+-------------------------------------------------------------+
| CJIE — Customer Journey Center      [window: 24h / 7d /30d] |
+-------------------------------------------------------------+
| Journey Completeness  Behaviour Class  Abandon Class  Trust |
|      92.4%                 88.1%           73.6%      61.2% |
+-------------------------------------------------------------+
| Live journeys (last 15 min)     |  Intent distribution      |
|  session · channel · intent     |  bar chart                |
|  · stage · duration · CTA       |                            |
+-------------------------------------------------------------+
| Conversion paths                 | Abandonment paths        |
| top 10 sequences → purchase      | top 10 → abandon + reason|
+-------------------------------------------------------------+
| Trust correlation table          | Checkout intelligence    |
+-------------------------------------------------------------+
| Session drill-down (modal): full ordered timeline, all      |
| events, product context, intent, abandonment reason, ROI    |
+-------------------------------------------------------------+
```

Auto-refresh every 30s. Registered in existing admin nav under Revenue.

Also add a "Journeys" tab to `RevenueAttributionCenterPage.tsx` linking to `/admin/customer-journey-center` (no duplicate content).

### Phase 9 — Journey Replay Metadata (extends `analytics_session_quality`)

Already added dead_clicks, rage_clicks, back_button_uses, search_uses, menu_uses, filter_uses, variant_selections, coupon_attempts, shipping_estimator_uses, checkout_exits in the previous turn. Now add:

- `mouse_movement_density integer`
- `scroll_velocity_avg integer` (px/s)
- `click_density integer`
- `idle_time_ms integer`
- `hesitation_events integer`
- `zoom_uses integer`
- `image_gallery_uses integer`

Client counters wired in `src/lib/ux-signals.ts` (single existing file). No PII, no keystroke capture, no session replay video.

### Phase 10 — Journey Questions Console

New actions on the existing `revenue-attribution` edge function (extend, do not fork): `journey_questions` returns pre-answered results for the 12 CEO questions using SQL over the views. Displayed as an "Ask Genesis" card on `/admin/customer-journey-center` and mirrored in Mission Intelligence.

### Phase 11 — Autonomous Recommendations (extends `gare-orchestrator`)

Two new playbooks:

- `cjie.abandonment_recovery` — for repeatable abandonment reasons above threshold, opens a `gare_recovery_plans` row with problem/evidence/journey/root-cause/opportunity/confidence/difficulty/rollback/expected_ROI/safe_autofix flag.
- `cjie.trust_element_promotion` — when a trust element correlates > 15% lift with conversion, promote it above-the-fold on affected PDPs.

No new orchestrator, no new UI — surfaces inside existing `/admin/recovery-center`.

### Phase 12 — Certification (extends `first-sales-accelerator.nightlyAudit`)

Nightly compute + sign SHA-256 payload into `genesis_perpetual_certifications`:

- journey_completeness_pct
- journey_accuracy_pct
- abandonment_classification_pct
- behaviour_classification_pct
- trust_classification_pct
- revenue_attribution_pct
- unknown_journey_pct
- prediction_accuracy_pct (measured against next-cycle actuals)

Auto-published to Evidence Explorer, Mission Control, Executive War Room, Report Center via existing evidence-links table — no new surface.

## Migrations (single batch, with GRANTs)

1. `CREATE TABLE cjie_session_journeys` (+ RLS admin-read, service_role full)
2. Extend `analytics_session_quality` with 7 additional behavioural counters
3. `cjie_classify_intent()` + `cjie_classify_abandonment()` PL/pgSQL functions
4. `cjie_build_journeys(since)` RPC — deterministic aggregation
5. Views: `v_product_journey_health`, `v_journey_paths_top`, `v_trust_element_correlation`, `v_navigation_intelligence`, `v_checkout_intelligence`
6. Schedule `cjie-build` cron every 5 minutes via existing pg_cron
7. Backfill last 7 days

## Files touched (extensions)

- **New:** `supabase/migrations/…` (single batch above)
- **New:** `src/pages/admin/CustomerJourneyCenterPage.tsx` + route
- **New:** `src/lib/trust-signals.ts` — trust IntersectionObserver
- **Extend:** `supabase/functions/revenue-attribution/index.ts` — add `journeys`, `journey_questions`, `session_detail` actions
- **Extend:** `supabase/functions/first-sales-accelerator/index.ts` — nightly journey certification
- **Extend:** `supabase/functions/gare-orchestrator/index.ts` — two playbooks
- **Extend:** `src/lib/ux-signals.ts` — 7 new counters
- **Extend:** `src/pages/admin/RevenueAttributionCenterPage.tsx` — Journeys tab link
- **Extend:** `src/context/CartContext.tsx` + `src/pages/PaymentSuccess.tsx` — missing checkout step events
- **Extend:** PDP wire trust-signals emitters (single line each on existing sections)

## Explicitly NOT built

- No new events pipeline. No new session table. No LLM narrative generation (evidence-only per directive). No visual heatmap library (uses aggregated event counts, not rrweb). No duplicate `/admin/customer-journey-*` variants — one page.

## Rollout order (single safe run)

1. Migrations (schema + functions + views + cron)
2. `cjie_build_journeys` backfill 7d
3. `revenue-attribution` extended actions
4. `CustomerJourneyCenterPage` + route
5. Client emitters (trust + UX counters + checkout steps)
6. GARE playbooks
7. Nightly certification
8. First journey certification signed & archived

Ready to execute — one turn, no destructive changes, all additive to production.

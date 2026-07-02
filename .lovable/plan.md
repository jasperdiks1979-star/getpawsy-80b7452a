
# GENESIS Ω∞ — Canonical Attribution & Revenue Intelligence

Per the Build Justification Directive, this mission is delivered by **extending existing systems**, not creating parallel ones. Below is the 4-point justification, the concrete extension plan, and what will be shipped in a single safe run.

## Build Justification (why extend, not create new)

1. **Existing is insufficient because:** `canonical_sessions` has only 21 columns and no immutable UTM/click-id snapshot; `analytics_traffic_classification` classifies at session level but does not run on every event; `cie_attribution_incidents` opens tickets but there is no operator-facing revenue-attribution surface. The Revenue War Room shows funnel counts but cannot answer "which Pinterest pin drove the most revenue".
2. **Revenue impact:** unattributed sessions currently collapse into `direct`/`unknown`, hiding the true ROI of Pinterest / TikTok / Google spend. Correct attribution unlocks reallocation of ad + creative budget to sources with proven profit — the single largest lever we have on gross margin.
3. **Why not modify existing is a lie — we ARE modifying existing.** New surface = one page (`/admin/revenue-attribution-center`) that reads from existing tables. All storage is added as columns/tables in the already-canonical namespaces (`canonical_*`, `cie_*`, `gad_*`). No parallel event pipeline.
4. **Measurable impact:** Attribution Completeness %, UTM Coverage %, Source Classification Accuracy %, Revenue Traceability % — all computed nightly and stored in `genesis_perpetual_certifications` (SHA-256), so we can prove week-over-week improvement.

## What already exists (reused, not rebuilt)

- `canonical_events` + `canonical_sessions` — event + session spine.
- `canonical-ingest` edge function — semantic dedupe already live.
- `cie-orchestrator` + `cie_attribution_incidents` + `cie_confidence_scores` — attribution gate.
- `analytics_traffic_classification` — channel logic (needs extension, not replacement).
- `gad_attributions` + `gad_events` — multi-model attribution ledger.
- `first-sales-accelerator` — funnel snapshotting.
- `gare-orchestrator` — Detect→Diagnose→Repair loop (used for self-repair, no new engine).
- `genesis_perpetual_certifications` + Evidence Vault — SHA-256 certification.

## Extension Plan

### 1. Canonical UTM Engine (extends `canonical_sessions`)
Migration adds immutable first-touch snapshot columns: `first_utm_source/medium/campaign/content/term`, `first_gclid`, `first_fbclid`, `first_ttclid`, `first_msclkid`, `first_pinterest_click_id`, `first_reddit_click_id`, `first_email_id`, `first_affiliate_id`, `first_referrer`, `first_landing_url`, `first_landing_url_normalized`, `redirect_chain jsonb`, `device`, `browser`, `country`, `region`, `city`, `timezone`, `language`, `screen_wxh`, and locks them with a `BEFORE UPDATE` trigger (immutable once non-null). Client-side: extend `resolveUtm` + `pushTrafficContext` to emit a one-shot `session_attribution_snapshot` CCI event on the first page of every session; `canonical-ingest` upserts the snapshot into `canonical_sessions` once.

### 2. Source Classification Engine (extends `analytics_traffic_classification`)
Rewrite the classifier as a single SQL function `public.classify_traffic_source(referrer, utm_source, utm_medium, click_ids jsonb) returns text` covering the 17 canonical channels from the directive. Called from `canonical-ingest` on every event (not just sessions), and backfilled once over the last 90d. `direct` only when referrer is null AND no utm/click ids.

### 3–5. Product / Funnel / Landing Intelligence (extends `first-sales-accelerator`)
Add three read-only SQL views on top of `canonical_events`:
- `v_product_attribution_daily` — impressions→view→ATC→checkout→purchase→revenue→margin per product per day per source.
- `v_funnel_intelligence_daily` — full funnel + conversion %, abandonment %, expected/lost/recovered revenue.
- `v_landing_page_intelligence_daily` — visitors, bounce, scroll, CWV join, revenue, device/country split.
Extend `first-sales-accelerator` with actions `productAttribution`, `funnelIntelligence`, `landingIntelligence` that read the views.

### 6. Session Replay Metadata (extends `analytics_session_quality`)
Add columns: `dead_clicks`, `rage_clicks`, `back_button_uses`, `search_uses`, `menu_uses`, `filter_uses`, `variant_selections`, `coupon_attempts`, `shipping_estimator_uses`, `checkout_exits`. Wire counters in existing `installUxSignals` / `sessionQualitySignals`. No PII stored.

### 7. Attribution Validation (extends `cie-orchestrator`)
New CIE action `attribution.reconcile` cross-checks `canonical_events` ↔ `gad_events` ↔ `ga4_daily_snapshots` ↔ `orders`. Mismatches open a `cie_attribution_incidents` row and, when confidence ≥ 95, `gare-orchestrator` auto-repairs via the existing loop. No new engine.

### 8. Attribution Center (ONE new admin page)
`/admin/revenue-attribution-center` — the only new UI. Reads exclusively from the views above. Tabs: Sources · Campaigns · Products · Landing · Funnels · Revenue Cube (by country / device / browser / pin / TikTok creative / keyword / email / returning) · First vs Last vs Assisted. Auto-refresh 60s. Wired into the existing admin nav under Revenue.

### 9. Business Questions Console (extends existing Mission Intelligence panel)
Add "Attribution Q&A" card to Mission Intelligence that answers the 14 CEO questions with SQL against the views + evidence link to the Attribution Center.

### 10. Self-Repair
Uses the existing `gare-orchestrator` playbook system — add two playbooks: `attribution.reclassify_direct` and `attribution.backfill_utm_from_referrer`. No new orchestrator.

### Certification
Extend `first-sales-accelerator.nightlyAudit` to also compute and store:
- attribution_completeness_pct
- event_coverage_pct
- utm_coverage_pct
- source_classification_accuracy_pct
- product_attribution_accuracy_pct
- funnel_integrity_pct
- revenue_traceability_pct

into a new `genesis_perpetual_certifications` row (type=`revenue_attribution`) with SHA-256 payload hash. Auto-published to Evidence Vault + Report Center via existing pipeline.

## Migrations (single batch, all with GRANTs)

1. `canonical_sessions` — add 20 first-touch columns + immutability trigger.
2. `analytics_session_quality` — add 10 behavioural counters.
3. Function `public.classify_traffic_source(...)`.
4. Views `v_product_attribution_daily`, `v_funnel_intelligence_daily`, `v_landing_page_intelligence_daily`.
5. Backfill 90d classification.

## Files touched (extensions, no duplicates)

- `supabase/functions/canonical-ingest/index.ts` — write first-touch snapshot, call classifier.
- `supabase/functions/cie-orchestrator/index.ts` — add `attribution.reconcile`.
- `supabase/functions/first-sales-accelerator/index.ts` — 3 new read actions + certification.
- `supabase/functions/gare-orchestrator/index.ts` — 2 new playbooks.
- `src/lib/utmNormalizer.ts` + `src/lib/cci.ts` — emit `session_attribution_snapshot` once.
- `src/lib/ux-signals.ts` + `src/lib/sessionQuality.ts` — new counters.
- **New:** `src/pages/admin/RevenueAttributionCenterPage.tsx` + route.
- `src/pages/admin/MissionIntelligencePanel.tsx` — Attribution Q&A card.

## Explicitly NOT built
- No new events pipeline, no new session table, no new "attribution engine" service, no new certification table, no new orchestrator. Every capability lands inside an existing surface.

## Rollout order (single safe run)
1. Migrations (with GRANTs) → 2. Backfill classifier → 3. Edge function deploys → 4. Client instrumentation → 5. Attribution Center page → 6. Nightly certification job → 7. First certification signed & archived.

Approve to execute.

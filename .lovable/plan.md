
# Genesis V3.5 — Pinterest Audience Intelligence OS

**Shift:** Optimize for **people** (US Pinterest users), not products. One thin audience layer on top of existing engines — no duplicate analytics, no placeholder AI.

---

## Reuse inventory (no duplicates)

- **Personas:** `gcp_concepts` (`customer_segments`, `emotional_drivers`, `buying_triggers`) + `mi_audience_clusters` already in production. We extend, not replace.
- **Reads:** `canonical_events/sessions`, `gv3_pi_scores`, `gv3_pin_growth_scores`, `gv3_mi_first_sale_plan_v`, `pinterest_pin_performance`, `pcie2_visual_dna`, `pcie2_creatives.duplicate_score` (from V3.4 diversity guard).
- **Writes Autopilot:** existing `autopilot_actions` with new `action_kind='audience_target'`.
- **Reuse functions:** `gv34-decision-loop`, `gv34-creative-diversity`, `pinterest-collective-intelligence`, `pcie2-publish-assembler`, `gcp-api`.

---

## New surfaces (minimal)

### Tables (1 migration)
- `gv35_audience_personas` — versioned persona definitions (name, intent, motivation, pains, dream, lifestyle, budget, pin_behavior jsonb, primary_emotion, confidence, evidence_count, evidence_sources jsonb). RLS admin-only; service_role write.
- `gv35_product_audience_match` — per product × persona: match_score, save_prob, click_prob, purchase_prob, rank (best/second/emerging/wrong/lost/untapped), updated_at. Composite PK.
- `gv35_audience_signals_daily` — daily rollup per persona: impressions, saves, clicks, atc, purchases, revenue, expected_revenue, status. Derived from canonical + pinterest_pin_performance via SQL.
- `gv35_settings` — toggle `audience_first_mode` (default false).

### Views (read-only, invoker)
- `gv35_audience_performance_v` — joins persona × canonical sessions × pin performance using existing `pcie2_creatives.persona_id`/hook_family mapping.
- `gv35_untapped_audiences_v` — personas with high external signal but low published coverage (uses `mi_trend_signals` + `pin_creative_scores`).
- `gv35_audience_timing_v` — best US hour per persona from `canonical_sessions` + `pinterest_posting_windows`.

### Edge functions (4 new, hourly/6h crons)
1. `gv35-persona-discovery` (daily 03:00 UTC) — Builds/refreshes personas from `mi_audience_clusters` + `gcp_concepts(customer_segments)` + recent canonical conversions. Writes to `gv35_audience_personas` with Wilson-bounded confidence; never overwrites human-locked rows. Emits learnings to `gcp_learnings`.
2. `gv35-audience-matcher` (every 6h) — For each product, compute persona probabilities via existing PI V3 + Pin Growth + canonical features. Writes `gv35_product_audience_match` with `ON CONFLICT DO UPDATE`. Dedup by `(product_id, persona_id)`.
3. `gv35-audience-evaluator` (6h) — Updates persona confidence from realized outcomes (canonical purchases joined via `pcie2_creatives.persona_id`). Adjusts `gv35_audience_signals_daily` and feeds `gcp_learnings`.
4. `gv35-audience-decision` (hourly, chained after `gv34-decision-loop`) — Picks top persona×product opportunities, enqueues into `autopilot_actions` with `dedupe_hash = sha1(persona_id|product_id|day)` and confidence-gated execution via `autopilot-dispatch`. No new dispatcher.

### Creative integration (no new pipeline)
- Add `persona_id` + `primary_emotion` columns to existing `pcie2_creatives` (additive, nullable) so Creative Director already in place can stamp briefs per persona. `pcie2-publish-assembler` reads them when present; falls back to current behavior otherwise.
- Diversity guard (`gv34-creative-diversity`) extended to also penalize persona-cluster repetition (one extra dimension in existing scorer — no new function).

### UI (1 tab added, no new page)
- New tab inside existing `src/pages/admin/MarketIntelligencePage.tsx`: **Pinterest Audience Intelligence**, file `src/components/admin/market-intelligence/tabs/AudienceIntelligenceTab.tsx`, with:
  - Top audiences today / Fastest growing / Best converting / Highest save / Highest purchase / Untapped
  - Audience overlap matrix, Creative diversity score, Emotion heatmap, Confidence column
  - "Next audience to target" + "Highest expected revenue audience" derived from `gv35_audience_decision` queue
  - Pull-through to existing `AudienceClusterTab` data; no duplicate fetches.

---

## Confidence methodology (single shared definition)
- Wilson lower bound at 90% on persona→purchase conversions from canonical events.
- Floor: `min_evidence = max(5 purchases, 200 sessions)` (from `gcp_settings.learning.min_evidence`).
- EMA decay per day from `gcp_settings.learning.decay_per_day`.
- Anything `<0.90` is non-executable (CIE rule). Surfaced but not auto-published.

## Execution safety
- Reuses V3.4 unique partial index on `autopilot_actions (action_kind, target_id, dedupe_hash) WHERE status IN ('queued','executing')`.
- All inserts `ON CONFLICT DO NOTHING`.
- No new cron names; piggyback on V3.4 hourly + 6h orchestrators where possible; one new daily 03:00 UTC for persona discovery.

## Quality gate
- `tsgo --noEmit` clean
- `canonical_validate_consistency()` 0% drift (no canonical edits)
- Linter: no new RLS violations, admin-only on every new table
- No new analytics events; reads-only against canonical
- Dedupe test: duplicate `audience_target` insert returns 0 rows affected

## Deliverables
1. One migration (4 tables, 3 views, 2 column adds, GRANTs, RLS, indexes).
2. Four edge functions above + one cron.
3. One new admin tab + small extension to MI page.
4. Deployment report: persona count, evidence backing, reused components, diversity delta, untapped audiences discovered, production readiness, blockers.

## Out of scope
- New dashboards/pages beyond the MI tab
- Replacing or duplicating GCP / MI / PCIE2 logic
- Direct publishing changes; everything continues to flow through existing Autopilot + assembler
- External signal scrapers (still the V3.4 blocker)

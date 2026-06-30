# First Sale Sprint — Execution Plan

Single KPI: **First Verified Purchase**. No new dashboards, no placeholders, no duplicate systems. Everything below extends the engines already running.

## Scope guardrails
- Reuse: Canonical Analytics, PI V3 (`gv3_pi_*`), Pinterest Growth V3 (`gv3_pin_growth_*`), MI V3 (`gv3_mi_first_sale_plan_v`), Audience V3.5 (`gv35_*`), Genesis V3.6 attribution (`gv36_*`), First Sale Autopilot (`gv34_*` + `autopilot_actions`), Creative Diversity (`gv34-creative-diversity`), PCIE-V2 creative pipeline (`pcie_v2_*` + `pcie-v2-creative-director`), Pinterest publish pipeline (`pcie2-publish-assembler`, `pinterest_pin_queue`).
- No new admin pages. One new card on the existing **Growth Command Center**.
- No fake scores: every metric ties to a real signal in canonical/PCIE/PI tables.

## Phase 1 — Creative Diversity Governor V2 (backend)
New edge function `gv-diversity-governor-v2` invoked as a **pre-render gate** by the PCIE-V2 pipeline (added as a stage before `image_render`/publish).
- Inputs: candidate decisions (scene, lighting, composition, interior, human, animal, headline, hook, cta, emotion, product, camera) + last 90 published `pcie2_creatives` and last 90 `pcie_v2_creatives`.
- 12-axis similarity using existing fingerprint catalogs (`pcie_v2_combo_fingerprints`, `pcie2_creatives.headline/cta/emotion_id/style_id/persona_id`) plus simple Jaccard on tokenized headline/hook/cta and per-attribute exact-match on the rest.
- If **max axis similarity > 0.70** OR overall > 0.55 → return `regenerate` with a forced "different world" hint drawn from the 30-world catalog seeded below. Hard reject after 3 regen attempts.
- Logs into `pcie_v2_events` (`event_type='diversity_v2_reject'`) for auditability — no new table.

### 30-world catalog
Seed `pcie_v2_scene_generators` (existing table, already used by pipeline) with the 30 worlds from the brief if missing, tagged `world_family`. Diversity governor uses a rolling 7-day per-world cap so feed never repeats a world more than twice in a row.

## Phase 2 — Product Prioritization
No new table. Create SQL view `gv_first_sale_priority_v` that joins:
- `gv3_mi_first_sale_plan_v` (already encodes PI/Pinterest/audience confidence, margin, intent)
- `gv34_first_sale_hunter_v` (US inventory, mobile PDP health)
- `gv36_combo_performance` (existing engagement)
Output: ranked product list with `priority_score` and `gate_passed` (all 9 criteria) — consumed by the autopilot dispatcher and the War Room card.

## Phase 3 — Multi-Creative Strategy
Extend `pcie-v2-creative-director` action `run_full`:
- For each `gate_passed` product, request **N=8 creative briefs** drawn from 8 distinct story archetypes (lifestyle, UGC, review, educational, infographic, comparison, funny, before/after) — archetypes already live in `pcie_v2_style_families`; just enforce one-per-archetype selection via the diversity governor.

## Phase 4 — Distribution Optimizer
New edge function `gv-distribution-optimizer` (hourly cron, replaces ad-hoc selection in the publish assembler call path):
- Pulls `pinterest_pin_queue` drafts where `status='draft'`.
- Scores each candidate on: title token novelty vs last 50, description novelty, keyword novelty, board diversity (vs `pinterest_board_performance` 7-day publish counts), audience novelty (`gv35_product_audience_match`), visual similarity (reuses governor), freshness, topic spread.
- Picks the next N to publish (N from `gv34_settings.publish_cadence` if present, else 6/hr). Writes the picks back as `pcie2_publish_queue` rows and lets the existing assembler send them.

## Phase 5 & 6 — CTR + Save Optimizer
Use existing per-candidate scorers `scoreCtrIntent` and `scoreOutboundIntent` (already wired in `pinterest-creative-director`). Extend them with a deterministic save-intent scorer (inspiration/aspiration/education/lifestyle/emotion keyword weights). The distribution optimizer's CTR/save scores become a hard floor (≥70) before publishing.

## Phase 7 — Landing Page Match
Add a check inside the distribution optimizer: pin headline+promise+hero must align with the product's PDP. Reuses `pin_landing_validations`. Reject if score <80 (existing threshold).

## Phase 8 — First Click Optimizer
Frontend-only addition to **PDP mobile** (`src/pages/ProductDetail.tsx`): when the visitor arrives from a Pinterest UTM, ensure the trust strip above the ATC shows: Free Shipping (if applicable), Fast US Delivery, In Stock, Secure Checkout, Money-Back, Social Proof. All values come from existing product fields — no new copy, no placeholders.

## Phase 9 — Autopilot
Schedule via existing pg_cron infra:
- `gv-diversity-governor-v2`: invoked per generation request (no cron).
- `gv-distribution-optimizer`: every 1h.
- `gv34-decision-loop`, `gv34-creative-diversity`, `gv34-learning-evaluator`, `gv36-attribution-stitcher`, `gv36-learning-loop`: already cron'd; verify and re-enable if disabled.

## Phase 10 — First Sale War Room (single Executive Card)
Add **one** card `<FirstSaleWarRoom />` to `src/pages/admin/GrowthCommandCenterPage.tsx` (the existing dashboard). Reads only from existing views:
- Best product today → `gv_first_sale_priority_v` top row
- Best audience → `gv35_audience_signals_daily` top persona for that product
- Best creative → `gv36_creative_performance_v` top row by `perf_score`
- Best board → `pinterest_board_performance` top 7-day saves
- Best posting window → `pinterest_posting_windows` highest engagement slot
- Purchase probability → existing `gv36_first_sale_memory` Bayesian P from V3.6 learning loop (no new math)
- Pause list → products with `gv36_combo_performance.status='retire'`
- Regenerate list → products with all combos `status IN ('declining','needs_refresh')`
- Top 5 actions → top 5 queued `autopilot_actions` by `priority_score`

No new tables, no new routes.

## Verification (final step)
1. `tsgo` typecheck.
2. Edge function smoke: invoke `gv-distribution-optimizer` once, confirm it enqueues real publish rows.
3. Read back the War Room card data via canonical SDK to confirm zero placeholders.
4. Run `gv34-connector-health-audit` + `gv36-learning-loop` to confirm pipeline is green.
5. Trigger one PCIE-V2 generation through the new governor and verify it lands in `pinterest_pin_queue` with `engine_version >= v2.3` and a diverse world tag.

## Technical notes
- Diversity governor uses pure TypeScript Jaccard + categorical equality; no ML, no LLM calls — deterministic, cheap, hourly-safe.
- All new SQL is one view (`gv_first_sale_priority_v`) — no new tables, so no GRANT/RLS churn beyond `GRANT SELECT ... TO authenticated`.
- Edge functions follow project conventions (CORS via `npm:@supabase/supabase-js@2/cors`, admin JWT guard, Zod body validation).
- War Room card lives in `src/components/admin/FirstSaleWarRoom.tsx` and is imported once into `GrowthCommandCenterPage.tsx`. ~250 LOC, no new routes.

## What this plan explicitly does NOT do
- No new dashboards or admin pages.
- No new "AI" scorers without a real signal source.
- No duplication of Canonical Analytics, MI, PI, Pinterest Growth, or V3.6 attribution.
- No video pipeline changes.
- No new secrets.

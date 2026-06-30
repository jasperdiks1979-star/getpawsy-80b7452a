
# Genesis V4 — Creative Intelligence Engine (CIE-V4)

Single mission: continuously learn **why** creatives stop / save / click / buy, and feed that learning back into generation. **Zero new analytics**. Everything is glue on top of what already ships.

## Reuse map (nothing new where these already exist)

| Capability | Existing system (reuse, do NOT duplicate) |
|---|---|
| Creative DNA storage | `gcd_creatives`, `gcd_visual_dna` (58 cols), `gcd_genes`, `gcd_concepts`, `gcd_performance`, `gcd_predictions`, `gcd_learnings`, `gcd_settings` |
| Performance / attribution | `canonical_events`, `canonical_sessions`, `gv36_attribution_links`, `gv36_combo_performance`, `gv36_creative_performance_v`, `gv36_persona_performance_v`, `pcie2_pin_performance` |
| Genome maths | `pei_creative_dna`, `pei_gene_performance`, `pei_weight_snapshots`, `pei_predicted_winners` |
| Generation pipeline | `pcie-v2-creative-director` + `pcie_v2_*` catalogs + `gv-diversity-governor-v2` |
| Distribution / diversity | `gv-distribution-optimizer`, `pinterest_board_performance`, `pinterest_posting_windows` |
| Personas / audiences | `gv35_audience_personas`, `gv35_product_audience_match` |
| Loop / explainability | `pcie2_xai_decisions`, `pcie2_evidence_runs`, `pcie2_trait_weights` |

Net new artifacts: **2 edge functions + 1 view + 1 dashboard card**. No new tables.

## Phase 1 — DNA Auto-Tagger (extend, don't replace)
- Add `image_dna_tag` pipeline stage to `pcie-v2-creative-director`. Every published creative is registered via `GCD.upsertCreative({genome, visual_dna})` using `gcd_visual_dna`'s 58 columns (covers all 40+ traits in the brief: emotion, story, room, palette, brightness, contrast, warmth, luxury_score, minimalism_score, outdoor, family, humor, educational, ugc, professional, camera angle/distance, focus, human/pet/product visibility, headline type, cta type, typography, complexity, negative_space, platform_style, intent, scroll_stop/save/ctr/purchase estimates).
- For backfill of historic pins: new edge function `cie-v4-dna-backfill` reads `pcie2_creatives` + `pcie2_pin_performance` rows missing a `gcd_visual_dna` row, runs a Gemini-2.5-flash vision pass (via Lovable AI Gateway, multimodal `image_url`), persists into `gcd_visual_dna`. Idempotent, batched 25/run, hourly cron.

## Phase 2 — Winner & Loser Genome (no new table)
- New SQL view `gv4_genome_v` on top of `gcd_performance` ⋈ `gcd_visual_dna` ⋈ `gv36_creative_performance_v` returning per-trait Wilson-confidence-weighted `success_score` and `failure_score`, ranked. Trait dimensions = every categorical/scored column in `gcd_visual_dna`.
- View also exposes "top X / bottom X" rows for: color, emotion, story, layout, hook, headline, product, persona, board, hour, day, US state, device, camera_angle, cta_style, lighting, interior_style, category, lifestyle_theme — sourced from the joined real tables.

## Phase 3 — AI Director consultation (rewire, don't rebuild)
- `pcie-v2-creative-director` already calls `pickWeighted()` on `pcie_v2_attribute_weights`. Add a pre-stage `gcd_consult` that calls `GCD.recommend(family)` and merges Winner Genome top-decile traits into the candidate set, then **hard-rejects** any candidate matching ≥2 Loser Genome bottom-decile traits. Logged into `gcd_engine_consultations` + `pcie2_xai_decisions`.

## Phase 4 — Hourly self-learning loop
- New edge function `cie-v4-learn` (cron every hour):
  1. `refresh materialized view` on the canonical perf MVs (already exist).
  2. Recompute `gcd_genes` EMA + Wilson confidence for every trait surfaced by `gv4_genome_v`.
  3. Promote/demote `pcie_v2_attribute_weights` rows accordingly (uses existing genetic-learning hook).
  4. Update `pinterest_posting_windows`, `pinterest_board_performance` rankings (these are already cron'd — just trigger refresh, don't duplicate).
  5. Write a `gcd_learnings` evidence row per material delta (audit trail).
  6. Snapshot to `pei_weight_snapshots` for evolution timeline.

## Phase 5 — Predicted Winners / Failures
- Reuse `pei_predicted_winners` + `gcd_predictions`. `cie-v4-learn` writes predictions for every draft in `pinterest_pin_queue` using current genome weights. No model retrain — Bayesian update only.

## Phase 6 — Distribution health (reuse)
- No new code. `gv-distribution-optimizer` already enforces freshness/topic/visual/keyword/board/audience/creative diversity. The new dashboard card just reads its outputs.

## Phase 7 — Executive panel (ONE card)
- Add `<CreativeIntelligenceV4Card />` to existing `GrowthCommandCenterPage.tsx`. Reads only:
  - Top 10 Winner DNA traits → `gv4_genome_v` (winner side).
  - Top 10 Loser DNA traits → `gv4_genome_v` (loser side).
  - Emerging patterns → `gcd_learnings` last 24h, sorted by delta magnitude.
  - Creative evolution timeline → `pei_weight_snapshots` last 30 days.
  - Predicted winners/failures → `gcd_predictions` joined to drafts.
  - Diversity score → `gv-distribution-optimizer`'s last run summary.
  - Pinterest distribution health → existing `pinterest_pipeline_health_snapshots`.
  - Expected purchase probability → `gv36_first_sale_memory.bayes_p` (existing).
- ~250 LOC, one file. No new route.

## Phase 8 — Verification
1. `tsgo` typecheck.
2. Smoke `cie-v4-dna-backfill` (returns batch_size + tagged count).
3. Smoke `cie-v4-learn` (returns updated_genes + new_predictions + snapshots count).
4. Verify card renders against real `gv4_genome_v` rows (no placeholders).
5. Trigger one PCIE-V2 generation, confirm `gcd_engine_consultations` row written and final creative blocked if Loser DNA detected.

## Hard rules
- No new tables, no new dashboard pages, no new attribution tracking — every metric ties to an existing canonical/PCIE/GCD/GV36/PEI row.
- No synthetic confidence: every score uses Wilson lower bound + min sample size (already defined in `gcd_settings`).
- Vision tagging uses the existing AI Gateway multimodal path (`google/gemini-2.5-flash`, `image_url` blocks) — no new secrets.
- Loop cadence is hourly; nothing more frequent (Pinterest sampling noise).

## What this plan explicitly does NOT do
- Does **not** create a parallel "v4_*" table tree.
- Does **not** duplicate Canonical Analytics, V3.6 attribution, or PEI evolution.
- Does **not** add a new admin page or route.
- Does **not** touch the video pipeline.

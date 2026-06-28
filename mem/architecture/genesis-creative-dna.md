---
name: Genesis Creative DNA
description: Permanent intelligence layer that explains why creatives perform; consulted by every generation/scoring/publish engine
type: feature
---
# Genesis Creative DNA (GCD)

Schema prefix `gcd_`. Admin-read only; writes go through `gcd-api` (service role).

## Tables
- `gcd_modules` (10): creative_genome, visual_dna, emotional_dna, story_dna, quality_dna, attention_engine, product_visibility, creative_family, gene_evolution, prediction_attribution
- `gcd_concepts` + `gcd_concept_history` (versioned via trigger on weight/confidence/evidence change)
- `gcd_creatives` (genome: prompt/seed/provider/parent/family/fingerprint)
- `gcd_visual_dna` (camera, lighting, composition, color, environment, emotion, story, scores)
- `gcd_genes` (per-family evolving gene library; wins/losses + EMA weight)
- `gcd_performance` (daily multi-metric + weighted Creative Success Score)
- `gcd_predictions` (predicted vs actual with CI + model_version)
- `gcd_learnings` (evidence ledger; auto-applies EMA deltas to concepts/genes)
- `gcd_graph_nodes/edges` (knowledge graph)
- `gcd_engine_consultations` (audit trail)
- `gcd_settings` (success-score weights, thresholds)

## Success Score weights
`ctr 10 · outbound 20 · save 15 · atc 15 · cvr 20 · roas 20` (configurable via `gcd_settings.success_score_weights`).

## API (`gcd-api` edge function)
`consult`, `recommend`, `upsertCreative`, `recordPerformance`, `predict`, `recordLearning`, `stats`.
Client: `src/lib/gcd/client.ts` → `GCD.*`.

## Rules for engines
- Every creative engine **must** call `GCD.recommend(family)` before generating.
- Every published creative **must** be registered via `GCD.upsertCreative({genome, visual_dna})`.
- Performance ingest **must** call `GCD.recordPerformance()`; weights propagate via `recordLearning`.
- All decisions explainable via `gcd_predictions` + `gcd_engine_consultations`.

## Admin
`/admin/creative-dna` — modules, concepts, gene leaderboards per family, top creatives.
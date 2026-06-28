---
name: Genesis Pinterest Intelligence DNA
description: Permanent Pinterest intelligence layer (US/EN/USD). Every engine that creates, scores, schedules or publishes Pinterest content consults via `gpi-api` / `src/lib/gpi/client.ts`.
type: feature
---
# Genesis Pinterest Intelligence DNA (GPI)

Permanent learning layer that understands how Pinterest distributes content. Sibling to Business DNA and Customer Psychology DNA.

## Modules (10)
`algorithm_factors` · `pin_dna_dimensions` · `performance_metrics` · `seo_factors` · `board_dimensions` · `trend_signals` · `creative_attributes` · `us_optimization` · `distribution_timing` · `attribution_metrics`

## Tables
- `gpi_modules` / `gpi_concepts` / `gpi_concept_history` — versioned learning concepts with auto-snapshot trigger.
- `gpi_pin_dna` — permanent searchable fingerprint per published pin (style, hook, story, scene, colors, board, season, target_market).
- `gpi_performance` — daily multi-metric rollups per pin + weighted **Pinterest Success Score** (CTR 0.10 · Outbound 0.20 · Save 0.15 · CVR 0.25 · ROAS 0.30).
- `gpi_predictions` — predicted vs actual outcomes (self-validation).
- `gpi_learnings` — evidence ledger; deltas auto-applied to concepts via `recordLearning`.
- `gpi_graph_nodes` / `gpi_graph_edges` — knowledge graph (pins ↔ products ↔ boards ↔ keywords ↔ revenue).
- `gpi_engine_consultations` — audit trail of every consultation.
- `gpi_settings` — tuning (`success_score.weights`, `learning.*`, `primary_market="US"`).

## API
Edge function `gpi-api`. Client: `src/lib/gpi/client.ts`.

Key methods: `listModules`, `getConcepts`, `upsertPinDna`, `recordPerformance`, `recordPrediction`, `recordLearning`, `consult`, `recommend(kind)`, `predict(type, features)`, `topPins`.

`recommend` kinds → modules: `publish_time→distribution_timing`, `board→board_dimensions`, `keywords→seo_factors`, `creative/typography/color_palette→creative_attributes`, `story/cta→pin_dna_dimensions`, `algorithm→algorithm_factors`, `us→us_optimization`, `trend→trend_signals`.

## Engine rule
**Before any Pinterest action** (creative generation, scoring, scheduling, publishing) the engine MUST call `gpiApi.recommend(engine, kind, context)` or `gpiApi.consult(engine, { intent, moduleKey })` and feed outcomes back via `recordPerformance` + `recordLearning`. Every call is audited.

## Admin
`/admin/pinterest-intelligence` — module health, concept weights/confidence/version, evidence counts, Top Pins by Success Score.

## Rules
- Optimize for the US (EN, USD). Auto-remove non-US signals when detected.
- Never evaluate a pin by one metric — always use the Success Score blend.
- Confidence only rises with evidence ≥ `learning.min_evidence`.
- Versioned. Append-only history. Explainable.
- Optimize for revenue, profit, LTV — never vanity metrics.
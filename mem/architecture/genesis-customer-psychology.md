---
name: Genesis Customer Psychology DNA
description: Permanent behavioral intelligence layer (US pet market). Every engine consults via `gcp-api` / `src/lib/gcp/client.ts` before customer-affecting decisions.
type: feature
---
# Genesis Customer Psychology DNA (GCP)

Permanent behavioral intelligence layer modeling WHY US pet customers buy. Sibling to Genesis Business DNA. Consulted by Pinterest, Revenue AI, Creative AI, Pricing AI, Analytics AI, Executive Board, PIE, and all future engines.

## Modules (10)
`emotional_drivers` · `buying_triggers` · `objections` · `customer_segments` · `journey_stages` · `content_preferences` · `pinterest_psychology` · `micro_signals` · `predictions` · `audiences`

## Tables
- `gcp_modules` — module catalog with rollups (concept_count, avg_confidence)
- `gcp_concepts` — versioned behavioral concepts (weight, confidence, evidence). Auto-snapshots to `gcp_concept_history` on change.
- `gcp_visitor_profiles` — dynamic segment/emotion/trigger/objection scores per visitor
- `gcp_signals` — raw micro-behavior telemetry (hover, dwell, scroll, exit). `authenticated` may insert.
- `gcp_predictions` — predicted vs actual outcomes (drives self-learning)
- `gcp_learnings` — evidence ledger; learnings with module_key+concept_key auto-apply EMA-style updates
- `gcp_graph_nodes` / `gcp_graph_edges` — knowledge graph linking psychology → products/categories/creative
- `gcp_engine_consultations` — audit trail of every engine consultation
- `gcp_settings` — global tuning (`learning.min_evidence`, `learning.decay_per_day`, `primary_market`)

## API
Edge function `gcp-api`. Client: `src/lib/gcp/client.ts` (`gcpApi.listModules / getConcepts / getVisitorProfile / recordSignal / consult / recommend`).

## Engine rule
**Before any customer-affecting decision** (creative, CTA, price, story, content, segment targeting) the engine MUST call `gcp.consult(engine, { intent, moduleKey })` or `gcp.recommend(engine, kind, context)` and log outcomes via `recordPrediction` / `recordLearning`. Every call is audited.

## Admin
`/admin/customer-psychology` — module health, concept weights/confidence/version, evidence counts.

## Rules
- Never overwrite — adjustments are EMA deltas via `recordLearning`.
- Confidence only rises with evidence ≥ `learning.min_evidence`.
- Versioned. Append-only history. Explainable.
- Optimize for trust, LTV, brand equity, profit — never CTR alone.
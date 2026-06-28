---
name: Genesis Knowledge Graph & Reasoning Engine (KGRE)
description: Eighth Genesis layer. gkg_* cognitive brain. Universal nodes/edges + reasoning, hypotheses, root causes, counterfactuals, decision briefs, long-term memory. gkg-api at /admin/knowledge-graph. Recommendations only.
type: feature
---
# Genesis Knowledge Graph & Reasoning Engine (KGRE)

Cognitive brain. Connects every existing DNA (Business, Customer Psychology, Pinterest, Creative, Analytics, Product, Market) into one queryable knowledge layer, then reasons over it.

## Tables (gkg_*)
- **Graph:** `gkg_nodes` (universal entity registry, unique `(node_type,ref_id)`) + `gkg_edges` (typed relationships with weight/confidence/evidence_count and validity window). Both versioned via `_history` snapshot triggers.
- **Cognition:** `gkg_hypotheses` (question, alternatives, evidence, counter_evidence, validation_plan), `gkg_root_causes` (cause_chain, evidence_chain), `gkg_counterfactuals` (simulated-only "what if"), `gkg_reasoning_traces` (question → evidence → chain → alternatives → conclusion → outcome → learning).
- **Decisions:** `gkg_decision_briefs` (target_consumer = growth_director|executive_board|revenue_ai|creative_ai|pricing_ai|governance).
- **Memory & integrity:** `gkg_memory` (success/failure/discovery/strategic lesson/prediction/experiment), `gkg_contradictions`, `gkg_consultations` audit log, `gkg_settings`.

## Edge weight evolution
`gkg_upsert_edge` performs evidence-weighted EMA on `weight`, increments evidence counters, and gradually grows confidence. `gkg_evolve()` retires low-confidence persistently-negative edges and marks stale open hypotheses.

## API — supabase/functions/gkg-api (uses Lovable AI Gateway, `google/gemini-3-flash-preview`)
`upsertNode`, `upsertEdge`, `searchKnowledge`, `semanticSearch`, `reason`, `generateHypotheses`, `findRootCause`, `predictOutcome` (counterfactual, simulated only), `buildDecisionBrief`, `recordOutcome` (closes the learning loop on a trace), `addMemory`, `detectContradiction`, `neighbors`, `evolve`, `stats`. Every call writes to `gkg_consultations`.

The reasoning, hypothesis, root-cause and brief endpoints pull a compact DNA snapshot (modules from all 7 Genesis DNAs) into the prompt before reasoning, so every conclusion is multi-DNA grounded.

## Governance
- Never changes production behavior. Recommendations only.
- Counterfactuals are `status='simulated'` and never auto-executed.
- All nodes/edges versioned forever; contradictions surfaced explicitly.

## Client / UI
`src/lib/gkg/client.ts` exports `GKG`. Dashboard at `/admin/knowledge-graph` with Reason, Hypotheses, Root Cause, Decision Briefs, Search, and Graph tabs.
---
name: Explainable AI Decision Engine (XAI)
description: Cross-engine decision ledger with reason codes, confidence, alternatives, counterfactuals, plain-English explanations, and nightly self-evaluation
type: feature
---
**Shared emitter:** `supabase/functions/_shared/xai-decision.ts` → `emitXaiDecision({sourceEngine, decisionType, summary, reasonCodes[], evidence, alternatives[], counterfactual, confidence, expectedLift, risk, dedupeKey, ...})`. Never throws — observability must not break callers. Auto-derives `plain_english` and `explainability_score`.

**Engine:** `pcie2-xai-engine` (service role).
- `?action=snapshot` (or GET) → `{feed, top_decisions, worst_decisions, evaluations, latest_evaluation}`.
- `?action=run` (POST) → attaches outcomes to pending decisions older than 7d using `pcie2_pin_performance` deltas, then writes a 14-day `pcie2_xai_evaluations` row.

**Cron:** id 252, `20 4 * * *` UTC (`pcie2-xai-engine-nightly`).

**Tables (admin RLS, service-role write):**
- `pcie2_xai_decisions` — every decision with reason_codes[], evidence jsonb, alternatives jsonb, counterfactual jsonb, confidence, expected_lift, risk, status (`pending|validated|missed|neutral`), explainability_score, dedupe_key unique.
- `pcie2_xai_outcomes` — actual_lift, revenue_impact_cents, ctr/save/purchase impact, prediction_error, was_correct.
- `pcie2_xai_evaluations` — nightly snapshot of accuracy, calibration, explainability, traceability, missing evidence pct, decision_quality_score (0-100), best/worst/highest_roi/most_expensive decision ids.

**Wired engines:** `pinterest-growth-director` mirrors its top 12 decisions per run. Pattern to add elsewhere: call `emitXaiDecision` immediately after persisting the engine's native decision row, with a stable `dedupeKey` of `${engine}:${run_id}:${type}:${subject}`.

**Dashboard:** `ExplainableAIPanel` on `/admin/pinterest-health` (no new page). Shows decision quality, accuracy %, explainability %, calibration, feed with click-through plain-English drill-in, top + worst decisions by revenue impact.

**Founder mode rule:** No engine may emit a recommendation without reason_codes + evidence + confidence + expected_lift. Missing fields lower the explainability score and surface in `missing_evidence_pct`.
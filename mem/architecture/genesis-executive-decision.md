---
name: Genesis Executive Decision Engine (EDE)
description: Ninth Genesis layer. Permanent 9-seat AI executive board (CEO/CRO/CMO/CFO/CPO/CCO/COO/Risk/CIO) with weighted consensus, alternatives, scenarios, business-value scoring, post-decision review and self-evolving weights. ede-api at /admin/executive. Recommendations only.
type: feature
---
# Genesis Executive Decision Engine (EDE)

Permanent AI executive board responsible for every strategic decision proposal. Operates above all engines, below Governance.

## Tables (ede_*)
- **ede_executives** — 9 seats (ceo, cro, cmo, cfo, cpo, cco, coo, cro_risk, cio) with rolling prediction/financial/business accuracy, trust, calibration, learning, and a composite `weight` recomputed by `ede_recalc_weights()`.
- **ede_proposals** — proposal_type (pinterest|tiktok|creative|budget|pricing|bundle|discount|supplier|inventory|seo|publish_freq|experiment|expansion|retire|launch|feature|infrastructure), risk_level, baseline+intervention, evidence, consulted_dna, requires_human.
- **ede_alternatives** / **ede_scenarios** (best|expected|worst|black_swan with recovery plan) / **ede_business_value** (revenue/profit/customer/operational/brand/strategic + risk/cost/ROI/horizon/learning/calibration metrics).
- **ede_votes** — per-executive approve/reject/conditional/abstain with reasoning, confidence, perspective_impact, evidence, weight_at_vote.
- **ede_decisions** — weighted consensus: outcome, weighted_score, approval_pct, participating_weight, rationale, governance_required, human_required.
- **ede_post_reviews** — expected vs actual; computes `decision_quality_score`; updates executive accuracies via EMA and recomputes weights.
- **ede_scorecards** / **ede_allocations** / **ede_settings**.

## Consensus rules
- approval_pct ≥ 66% (and no conditional weight) → `approved`
- approval_pct ≥ 50% → `conditional`
- Chief Risk Officer `reject` on high/critical risk = veto → `rejected`
- CFO `reject` when profit_impact_usd < 0 = veto → `rejected`
- risk_level=critical OR business_value.risk_score≥0.7 → governance_required
- risk_level=critical OR risk veto → human_required

## API — supabase/functions/ede-api (Lovable AI, `google/gemini-3-flash-preview`)
`proposeDecision`, `generateAlternatives`, `simulateScenario`, `calculateBusinessValue`, `runExecutiveVote`, `evaluateProposal` (full pipeline), `approveDecision`, `reviewDecision` (closes the loop and self-updates executive weights), `listQueue`, `getProposal`, `stats`, `recalcWeights`.

Each LLM vote is generated from the executive's own perspective + mandate, with full business-value, alternatives, and scenarios injected. DNA snapshot (business/product/market/customer) is passed into every alternative / business-value call so reasoning is multi-DNA grounded.

## Governance
- Recommendations only — never executes operational changes.
- `human_required` and `governance_required` surface in the dashboard for human approval before any operational engine can act.
- Every vote, decision and review is auditable and forever-versioned.

## Client / UI
`src/lib/ede/client.ts` exports `EDE`. Dashboard at `/admin/executive` with Board, New Proposal, Queue, Decision Detail, and History tabs.
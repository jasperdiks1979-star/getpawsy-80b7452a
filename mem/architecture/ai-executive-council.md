---
name: AI Executive Council
description: Highest decision layer. 13 specialist Pinterest AI advisors vote through the XAI ledger; Council weights by reliability, resolves conflicts, emits priorities + CEO briefing
type: feature
---
**Edge function:** `supabase/functions/aec-executive-council/index.ts` (service role).
- `GET` or `?action=snapshot` → `{last_run, briefing, advisors, decisions, priorities, votes, counts}`
- `POST {action:"run"}` → convene Council: pull last 30h of `pcie2_xai_decisions`, group by decision_type+subject, weight each advisor's vote by `current_weight × confidence × evidence_quality`, pick action with highest weighted score, classify consensus (unanimous / weighted_majority / conflict), score short/long-term benefit, expected revenue, stability, learning value, risk, maintenance. Auto-builds the briefing.
- `POST {action:"briefing"}` → CEO morning briefing (one row per date, max 10 bullets, founder action defaults to "None").
- `POST {action:"weekly_review"}` → recompute per-advisor reliability and rebalance `current_weight` (0.2–2.0).

**Reuses, never duplicates:** every advisor already writes to `pcie2_xai_decisions` via `_shared/xai-decision.ts`. The Council reads, weights, votes, and emits its top 8 decisions back to XAI for traceability.

**Advisors (13):** creative_factory · quality_engine · verification_engine · growth_director · experiment_engine · market_intelligence · collective_intelligence · adaptive_learning_governor · evidence_governor · explainable_ai · health_monitor · trend_intelligence · board_intelligence. Mapping in `ENGINE_TO_ADVISOR`.

**Tables (admin-read RLS, service-role write):**
- `aec_advisors` — registry + `current_weight` + `reliability_score`
- `aec_council_runs` — per-run aggregate (council_confidence, consensus, projected_monthly_revenue_cents, decision_quality_score)
- `aec_advisor_votes` — every vote with recommendation, confidence, risk, expected_roi, evidence_quality, time_horizon, weight, vote_score
- `aec_decisions` — final action + short_term_benefit, long_term_benefit, expected_revenue_cents, expected_stability, expected_learning_value, expected_risk, expected_maintenance_cost, consensus, votes_for/against, explanation
- `aec_priorities` — Top 10 lists (opportunity / risk / bottleneck / experiment / content / product)
- `aec_briefings` — one row per date with up to 10 bullets and `required_founder_action` (default "None")
- `aec_reliability_ledger` — weekly self-review per advisor

**Crons:**
- `aec-executive-council-nightly` — `0 5 * * *` UTC (convene Council + briefing)
- `aec-executive-council-briefing` — `30 6 * * *` UTC (refresh CEO briefing)
- `aec-executive-council-weekly-review` — `45 4 * * 1` UTC (Monday self-review)

**Dashboard:** `ExecutiveCouncilPanel` at the top of `/admin/pinterest-health` (no new page). Shows Council confidence, consensus, decision quality, projected revenue, advisor votes, Top Opportunities/Risks/Experiments, the CEO briefing and live conflict count.

**Founder-mode rule:** the founder manages objectives, not engines. The briefing's `required_founder_action` is normally "None" and only surfaces conflicts when `council_confidence < 0.35` or ≥4 conflicts. Individual engines must not act on cross-engine strategic changes (publishing volume, learning speed, budget shifts) without a Council decision — the Council is the highest layer above BOS execution, but BOS objectives still win when they conflict.
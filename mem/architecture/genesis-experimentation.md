---
name: Genesis Autonomous Experimentation Engine (AEE)
description: Tenth Genesis layer. aee_* scientific lab — hypothesis → progressive rollout → statistical (z-test, Wilson CI, Bayesian P(best)) + business evaluation → learning → playbooks. aee-api at /admin/experiments.
type: feature
---
# Genesis Autonomous Experimentation Engine (AEE)

Scientific lab. Every AI engine may submit hypotheses; nothing changes strategy permanently without controlled evidence.

## Tables (aee_*)
- **aee_hypotheses** — statement, rationale, evidence, expected revenue/profit/customer impact, confidence, risk, opportunity_size, business_alignment, computed `priority_score` via `aee_priority_score()`.
- **aee_experiments** — full lifecycle (draft → approved → running → paused/stopped → evaluated → winner_declared / no_difference / failed → archived), design (ab|abc|multivariate|sequential|bayesian|bandit), primary + guardrail metrics, business_metric, progressive `rollout_pct` (1/5/10/25/50/100), `governance_required` auto-set for high/critical risk.
- **aee_variants** + **aee_assignments** (per-subject audit) + **aee_observations** (raw stream).
- **aee_results** — statistical summary per evaluation: n, conv_rate, lift, Wilson CI, z, p_value, `bayesian_prob_best` (Beta-Binomial Monte Carlo), business_value_usd, profit_usd, is_significant.
- **aee_winners** / **aee_failures** (failure intelligence) / **aee_playbooks** (reusable recipes) / **aee_recommendations** (daily backlog) / **aee_safety_log** (auto-stop trail).

## Statistical engine (in `aee-api`)
Two-proportion z-test (`aee_evaluate_zscore` SQL helper + JS `normalCdf`/two-tailed p), Wilson 95% CI, and Bayesian `P(variant > control)` via 4 000 Beta draws. Winner requires `is_significant` (p<0.05) OR `bayesian_prob_best ≥ 0.95`, and ranks candidates by profit before lift.

## Safety
`evaluateExperiment` auto-stops and logs when any non-control variant shows profit < 0 with lift ≤ −10% and n ≥ 50. All experiments are reversible, fully logged, and high-impact ones require Governance approval.

## API — supabase/functions/aee-api
`createHypothesis`, `createExperiment`, `approveExperiment`, `launchExperiment`, `pauseExperiment`, `stopExperiment`, `assign`, `record`, `evaluateExperiment`, `declareWinner`, `declareNoDifference`, `recordFailure`, `generateLearning` (LLM-derived playbook + lessons), `recommendExperiment` (daily backlog), `searchExperiments`, `getExperiment`, `stats`.

## Client / UI
`src/lib/aee/client.ts` exports `AEE`. Dashboard at `/admin/experiments` with Live, New, Detail, Winners, Failures, Playbooks, and Ideas tabs.
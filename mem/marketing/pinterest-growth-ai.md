---
name: Pinterest Growth AI
description: Daily revenue-optimization brain — winner multiplier, loser flagging, best-time/board/headline intelligence; reuses existing engines, no new tables
type: feature
---
**Edge function:** `pinterest-growth-ai` (service-role).
- `GET` or `?snapshot=1` → read-only snapshot for the dashboard.
- `POST {}` → execute: persists snapshot to `pinterest_ops_snapshots`, logs to `pinterest_evolution_log` (`growth_ai_recommendation` / `growth_ai_winner_multiplier` / `growth_ai_loser_flag`), and invokes `pinterest-creative-factory` for the #1 winner when revenue/pin > 2× account avg.
- `POST {dry_run:true}` → compute + log + persist, no factory call.

**Cron:** id 244, `15 2 * * *` UTC (`pinterest-growth-ai-daily`).

**Data sources (all existing):** `pinterest_revenue_funnel_daily` (30d), `pinterest_pin_queue.posted_at` (best hour/weekday), `pcie2_ci_scores` (top headlines/hooks/CTAs by score).

**Snapshot fields:** baseline (avgCtr, avgRevenuePerPin, totals), topRevenue/Organic/CTR products, topBoards, bestHoursUtc, bestWeekdays, topHeadlines/Hooks/CTAs, growthVelocity (WoW clicks & revenue %), estimatedWeeklyOrganicTraffic, estimatedMonthlyRevenueCents, aiConfidence (0..1 from sample size), nextRecommendedOptimization, winnerMultiplier, loserBlocklistCandidates.

**Dashboard:** rendered inside `/admin/pinterest-health` (no new page). Auto-refreshes every 60s alongside the existing flow monitor.

**Safety:** Read-only against perf tables. Only writes to `pinterest_ops_snapshots` and `pinterest_evolution_log`. Winner multiplier respects existing creative-factory guardrails (board governor, CI gate, US filter).
# AGP Wave 4A+ — Autonomous Growth Intelligence Layer

Builds on the existing Signal Lake (`agp_signals_daily`), Growth Scores (`agp_growth_scores`), and Product Health (`agp_product_health`). Nothing existing is replaced.

## Scope (8 stages, one run)

### Stage 1 — Schema (one migration)
New tables (all admin-only RLS + service_role grants):
- `agp_score_explanations` — per subscore per day: prev, curr, abs_delta, pct_delta, reason, confidence, business_impact, root_cause, expected_trend.
- `agp_action_priorities` — recommendation id, 6 impact axes (revenue/traffic/pinterest/seo/conversion/profit), difficulty, cloud_cost_usd, ai_cost_usd, exec_minutes, confidence, priority_score, status.
- `agp_product_opportunity` — per product: 12 component scores + expected_roi, expected_monthly_rev_cents, expected_annual_rev_cents, overall_score, rank.
- `agp_business_explanations` — daily natural-language explanation per subscore (markdown), suggested_actions jsonb, expected_score_after.
- `agp_forecasts` — horizon (1d/7d/30d/90d) × metric (revenue/orders/traffic/pinterest/conversions/profit/cloud_usd/ai_usd/inventory), predicted, low, high, confidence, model.
- `agp_daily_insights` — top10_wins jsonb, top10_problems jsonb, biggest_opportunity, biggest_threat, most_profitable_product, fastest_category, worst_category, top_board, top_campaign, top_prompt, top_creative_style.
- `agp_prediction_accuracy` — predicted vs actual, mape, applied_weight_adjustment.
- `agp_score_weights` — versioned weight vector for the scorer (self-tuning).

### Stage 2 — Edge functions (8 new, all service-role)
- `agp-score-explainer` — diffs latest vs prior `agp_growth_scores`, writes `agp_score_explanations`. Uses Lovable AI (`google/gemini-3-flash-preview`) for `reason`/`root_cause`/`expected_trend` (batched, 1 call per day, not per subscore).
- `agp-action-prioritizer` — pulls open recs from `ai_revenue_recommendations` + `gi_growth_decisions` + new explanations, scores them, writes `agp_action_priorities`.
- `agp-opportunity-indexer` — joins `products`, `agp_product_health`, `pinterest_revenue_opportunity_scores`, `cj_media_asset_registry`, `product_intelligence`, computes 12 components → overall + rank → `agp_product_opportunity`.
- `agp-business-explainer` — natural-language per-subscore explanations + suggested actions + expected-after score; one AI call rolling up all subscores.
- `agp-forecaster` — EWMA + linear regression over last 90d of `agp_signals_daily` per metric × 4 horizons → `agp_forecasts`.
- `agp-daily-insights` — winners/losers/threats/opportunities aggregator → `agp_daily_insights`.
- `agp-self-improver` — compares yesterday's `agp_forecasts` vs today's actuals, writes `agp_prediction_accuracy`, nudges `agp_score_weights` (bounded ±5% per axis per day).
- `agp-intelligence-orchestrator` — runs all of the above in order, idempotent per day, writes one `agp_runs` row with step timings.

### Stage 3 — Cron
Single cron at 02:45 UTC (after existing 02:00 collector / 02:30 scorer) invoking `agp-intelligence-orchestrator`.

### Stage 4 — UI (extend `/admin/autonomous-growth`)
New panels in `src/pages/admin/AutonomousGrowthPage.tsx`:
- `ScoreExplainerPanel` — per-subscore card with delta chip, reason, confidence bar, root cause, expected trend.
- `ActionPriorityPanel` — sortable table, top 20 highlighted, ROI badge.
- `OpportunityIndexPanel` — Top 20 product cards + full ranked table (virtualised).
- `BusinessExplanationsPanel` — narrative per subscore + suggested actions + expected-after.
- `ForecastPanel` — 4-horizon chart per metric (recharts), confidence bands.
- `DailyInsightsPanel` — wins/problems/opportunities/threats grid.
- `SelfImprovementPanel` — MAPE per metric, weight-adjustment log.
- `HeatMapPanel` + `OpportunityMatrixPanel` (impact × difficulty scatter).

All data fetched directly from the new tables via `supabase` client. No new client-side compute.

### Stage 5 — Historical backfill
One-shot script triggered from the orchestrator with `?backfill=90`:
- Replays `agp_signals_daily` history through forecaster + explainer for last 90 days where data exists.
- Computes baseline `agp_prediction_accuracy` so weight adjustment can start immediately.

### Stage 6 — Executive PDF (daily)
- New edge `agp-executive-pdf` — generates JSON; a Python `reportlab` script (run via skill) renders the PDF. Sections: Exec Summary · Growth Score Evolution · Trend Charts · Top Opportunities · Top Threats · Recommended Actions · AI/Cloud Usage · Revenue & Pinterest Forecasts · Product Winners/Losers · Expected ROI.
- Output: `public/admin-reports/executive/YYYY-MM-DD-executive-briefing.pdf` + JSON; surfaced in Admin → Reports under a new "Executive Briefings" section.
- First run produced during this implementation, then daily at 03:15 UTC.

### Stage 7 — End-to-end validation
- Dry-run orchestrator → live orchestrator → assert each new table has rows for today.
- Snapshot screenshots of every new panel (Playwright, 1280×1800).
- Verify forecasts non-null, explanations non-empty, accuracy row present.

### Stage 8 — Implementation report
Per standing rule:
- `public/admin-reports/ai-implementation/2026-06-25-agp-wave-4a-plus-intelligence.pdf` + `.json`
- Prepend to `manifest.json`
- Sections per the AI-implementation-reports preference, including scorecard.

## Cost & safety
- All AI calls use `google/gemini-3-flash-preview`, capped at ≤ 4 calls per orchestrator run (~ $0.05/day).
- No writes to `products`, no Pinterest publishes, no money movement.
- Weight self-tuning bounded ±5%/day per axis with a kill switch in `agp_settings`.
- All new tables: admin SELECT via `has_role`, service_role full, no anon.

## Deliverables checklist
- 1 migration (8 tables + grants + RLS + cron)
- 8 edge functions
- 8 UI panels
- Backfill executed (90d where data exists)
- First executive PDF generated
- Implementation PDF + JSON shipped and manifest updated
- Live validation screenshots attached to the report

Approve to execute end-to-end in one run.
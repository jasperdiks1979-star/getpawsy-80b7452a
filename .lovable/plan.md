
# Autonomous Growth Intelligence Engine V1

Your project already has ~80% of this built. Tables like `gi_*`, `growth_*`, `pinterest_pin_performance`, `pinterest_pin_verdicts`, `pinterest_loser_blocklist`, `pinterest_creative_winners`, `revenue_ai_*`, `pinterest_category_rotation`, `pinterest_posting_windows`, `monitoring_alerts`, plus 20+ panels in `/admin/growth-intelligence`, `/admin/pinterest-intelligence`, `/admin/revenue-ai` already cover 12 of your 15 modules.

Before I write thousands of lines duplicating existing infra, I need to confirm scope.

## What already exists (do NOT rebuild)

| Module | Existing system |
|---|---|
| M1 Daily Performance | `gi_*` tables, `pinterest_analytics_daily`, `ga4_daily_snapshots`, cron syncs |
| M2 Winner Detection | `revenue_ai_winner_dna`, `pinterest_pin_verdicts`, `pinterest_loser_blocklist`, `revenue-ai-winner-detect` |
| M3 Pin Quality | `pinterest_pin_dimensions`, `cinematicQaAudit`, Gold Standard ≥80 gate |
| M4 A/B Tests | `cta_variant_config`, `pinterest_creative_variants`, `mi_experiments` |
| M6 Discovery | `revenue_priority_score_v2`, `hot_product_scores`, `growth_product_scores` |
| M7 Category Balancer | `pinterest_category_rotation`, Diversity Governor |
| M8 Content Planner | `pinterest_autopilot_schedule`, `pinterest-creative-director` |
| M9 Fatigue | `pinterest_creative_intents`, `cinematic-style-bias`, hook fatigue tracking |
| M11 Dashboard | `/admin/growth-intelligence`, `/admin/pinterest-intelligence`, `/admin/revenue-ai` |
| M12 Alerts | `monitoring_alerts`, `monitoring_realtime_alerts`, `revenue_alert_log`, `sms_alert_logs` |
| M13 Learning | `growth_strategy_scores`, `revenue_ai_winner_dna`, `cinematic_creative_dna` |
| M14/M15 Safety/Perf | `pinterest_publish_governor`, `pinterest_credit_state`, idempotency keys |

## What is genuinely missing (worth building)

1. **Unified Growth Score (0–100)** — one composite KPI rolled up daily into a new `growth_daily_scorecard` table, blending Pinterest health + SEO health + conversion + revenue trend.
2. **M5 Landing Page Analyzer** — no per-PDP audit table exists. Add `pdp_health_audits` + an edge function that runs Lighthouse-lite checks (title, mobile, trust badges, reviews, FAQ, schema, CWV from `web_vitals`) rule-based, zero AI.
3. **M10 Campaign Advisor (recommend-only)** — `pinterest_campaign_recommendations` table + edge function that reads ads spend/ROAS and emits suggestions; never auto-mutates budgets.
4. **Executive Overview page** — single `/admin/growth-command` route that stitches the existing panels + new scorecard + landing-page health + campaign advisor into one dashboard. Existing pages stay.
5. **Orchestrator cron** — `growth-intelligence-orchestrator` nightly job that chains the existing engines in correct order and writes one summary into `growth_daily_scorecard`.

## What I will NOT do (per your standing rules)

- No AI image/video generation
- No duplicate tables (will reuse `gi_*`, `growth_*`, `pinterest_*`)
- No auto-budget changes on ads (advisor only)
- No teardown of existing dashboards/engines

## Deliverables (3 phases)

**Phase 1 — Schema & data layer**
- Migration: `growth_daily_scorecard`, `pdp_health_audits`, `pinterest_campaign_recommendations` (+ GRANTs, RLS admin-read).

**Phase 2 — Edge functions (all hourly/nightly crons, zero AI credits)**
- `growth-scorecard-compute` (nightly 03:00 UTC) → composite score from existing tables
- `pdp-health-audit` (nightly 04:00 UTC) → rule-based PDP scan over active products
- `pinterest-campaign-advisor` (daily 05:00 UTC) → reads spend/ROAS, writes recommendations
- `growth-intelligence-orchestrator` (nightly 02:00 UTC) → invokes the 6 existing nightly engines + the 3 new ones in order, logs to `growth_decisions`

**Phase 3 — UI**
- New `/admin/growth-command` page with 4 sections: Daily Growth Score, PDP Health, Campaign Advisor, Orchestrator status. Embeds existing panels via existing components.

## Open questions before I start

1. **Scorecard weights:** default to `Revenue 35 + Pinterest health 25 + Conversion 20 + SEO 10 + Inventory 10`. OK?
2. **PDP audit frequency:** all 428 active products nightly, or top 100 by RPS v2 daily + full sweep weekly? (full nightly = ~5min function time, no AI)
3. **Campaign Advisor data source:** you don't currently sync Pinterest Ads spend into `ad_spend_entries` for Pinterest specifically — should the advisor run on `pinterest_pin_performance` + `pinterest_revenue_attribution_v3` only until ads sync is wired, or do you want me to also build the ads sync now?
4. **Orchestrator on-failure behavior:** continue with remaining steps + alert via `monitoring_alerts`, or halt + alert? Default: continue + alert.

Answer the 4 questions (or say "your defaults") and I'll ship Phase 1–3 in one pass.

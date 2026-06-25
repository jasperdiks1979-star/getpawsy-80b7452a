# AGP Wave 6 — AGP Commander (Autonomous AI CEO)

Wave 6 is the **executive orchestration layer** above every existing engine: AGP 1–5, CPE, Pinterest Engine, Cinematic V3, CJ Media Pipeline, ARO, Growth Intelligence, Signal Lake, Recommender, Pricing/Promotions/Budget/Forecaster, Self-Healing Watcher. It does not rebuild any of them — it observes their state, scores every candidate action on one weighted priority, allocates AI/cloud/queue budget, and dispatches into the existing engines it already has.

Per the same delivery rule used for Waves 4 and 5, Wave 6 ships as **four sub-waves**. Each is independently usable, leaves the platform working, and produces a PDF + JSON report.

## Sub-wave 6A — Unified Business State + Master Priority Engine (foundation)

Goal: one canonical hourly snapshot of the entire business + one weighted score every action is ranked by.

- New tables (RLS-locked, admin/service_role only):
  - `commander_business_state` — hourly row: scores for revenue, profit, marketing, pinterest, seo, infra, ai, cloud, inventory, forecast_confidence, plus raw KPIs joined from `agp_growth_scores`, `aro_business_kpis_daily`, `aro_channel_economics_daily`, `pinterest_*`, `gsc_*`, `ga4_daily_snapshots`, `monitoring_*`. One unified `business_health_score` (0–100).
  - `commander_action_candidates` — every actionable item pulled from `agp_recommendations`, `aro_pricing_recommendations`, `aro_promotions`, `aro_budget_allocations`, `pinterest_publish_queue`, `cpe_creative_jobs`, `cinematic_v3_dispatch_queue`, `seo_actions_queue`. Columns: source_engine, action_type, target, revenue_impact, profit_impact, traffic_impact, conversion_impact, seo_impact, pinterest_impact, customer_impact, complexity, ai_cost, cloud_cost, eta_minutes, risk, confidence, strategic_weight, long_term_value, **priority_score** (0–100), status (proposed/queued/running/done/failed/skipped/blocked), reason.
  - `commander_settings` (singleton) — autonomous mode flags per engine, hourly/daily/monthly AI + cloud budget caps, min business_health_score to auto-execute, approval thresholds, kill switch.
- Edge functions:
  - `commander-state-collector` (cron `0 * * * *`) — assembles `commander_business_state` purely by reading existing tables (no new external API calls).
  - `commander-priority-scorer` (cron `5 * * * *`) — gathers candidates from the eight upstream queues above, normalises impact estimates, applies weighted score `0.30·profit + 0.20·revenue + 0.10·traffic + 0.10·conversion + 0.10·strategic + 0.10·long_term + 0.10·(1-risk)·confidence − cost_penalty`, writes `commander_action_candidates`.
- UI: new **AGP Commander** dashboard at `/admin/agp-commander` — hero with `business_health_score` + 11 sub-scores, "Top 50 Next Actions" priority queue with engine badge, expected impact, cost, and one-click Approve/Skip/Defer.
- Report: PDF + JSON to `public/admin-reports/ai-implementation/`.

## Sub-wave 6B — Resource Allocator + Intelligent Orchestrator + AI Model Router

Goal: turn the priority queue into safe, budget-aware dispatches across existing engines.

- New tables:
  - `commander_resource_pools` — pool (ai_budget_usd, cloud_budget_usd, render_slots, pinterest_slots, video_slots, image_slots, seo_slots, queue_workers), capacity, in_use, reserved, reset_window (hour/day/month).
  - `commander_dispatch_log` — every dispatch: candidate_id, target_engine, target_function, payload jsonb, started_at, finished_at, status, actual_ai_cost, actual_cloud_cost, observed_impact jsonb, rollback_ref.
  - `commander_model_routing` — task_type (simple_text, structured_extract, reasoning, image_gen, image_edit, video_gen, embeddings), candidate_models[], cost_per_unit, quality_score, last_used, win_rate.
  - `commander_playbooks` — trigger (pinterest_drop / seo_drop / cvr_drop / supplier_update / oos_risk / margin_erosion / creative_fatigue), ordered action_sequence jsonb, dry_run_only bool.
- Edge functions:
  - `commander-allocator` (`*/15 * * * *`) — reads `commander_resource_pools` + open candidates, enforces per-engine + global caps, marks candidates `queued` only if budget exists, otherwise `blocked` with reason.
  - `commander-orchestrator` (`*/10 * * * *`) — pops the highest-priority queued candidates within autonomous-mode caps, dispatches to the right existing edge function (`cpe-image-enhancer`, `cinematic-ad-autopublish`, `pinterest-growth-engine`, `aro-pricing-engine`, `seo-action-engine`, etc.), writes `commander_dispatch_log`. Triggers playbooks when `commander_business_state` deltas match a `commander_playbooks.trigger`.
  - `commander-model-router` — small library + edge function used by other functions to pick a model based on `commander_model_routing` (e.g. simple_text → `google/gemini-3.1-flash-lite`, reasoning → `openai/gpt-5.4`, image_gen → `google/gemini-3.1-flash-image`). Falls back to next-cheapest on `429`/`402`.
- UI: **Resources**, **Playbooks**, **Dispatch Log** tabs on `/admin/agp-commander` — pool utilisation bars, playbook firing history, last 200 dispatches with rollback button (uses `rollback_ref` against the dispatching engine's existing undo path).
- Report: PDF + JSON.

## Sub-wave 6C — Business Memory + Predictive Intelligence + Self-Healing Hardening

Goal: long-term knowledge base + forecasting + extended auto-repair.

- New tables:
  - `commander_memory` — dimension (winning_creative_style, winning_pin_hook, winning_product, winning_prompt, winning_model, supplier_reliability, seasonality_window, campaign_outcome), key, value jsonb, n_obs, win_rate, revenue_per_obs, ewma_score, last_updated. Extends — does not replace — `agp_learning_memory`, `aro_learning_memory`, `pinterest_winner_dna`, `revenue_ai_winner_dna`, `cinematic_creative_dna`. Memory rows reference upstream IDs.
  - `commander_forecasts` — metric (revenue, orders, profit, pinterest_impressions, organic_traffic, ads_roas, oos_risk, ai_spend, cloud_spend), horizon_days, value, ci_low, ci_high, generated_at. (Reuses `aro_forecaster` outputs and adds Pinterest/SEO/infra forecasts on top.)
  - `commander_anomalies` — type (budget_overrun_pred / oos_pred / cvr_drop_pred / supplier_risk / trend_shift / holiday_demand / secret_expiring / db_slow_query / queue_stall / storage_failure), severity, evidence jsonb, recommended_playbook_id, status, alerted_at.
- Edge functions:
  - `commander-memory-writer` (cron `30 4 * * *`) — distils every `commander_dispatch_log` row from the past 24 h into `commander_memory` EWMA updates per dimension; promotes/demotes patterns.
  - `commander-forecaster` (cron `15 5 * * *`) — produces 7/30/90-day forecasts with 80 % CIs, logs prediction-vs-actual against past forecasts.
  - `commander-anomaly-detector` (cron `*/20 * * * *`) — combines forecast deltas + Wave-1 self-healing watcher + ARO `aro_risk_signals` to populate `commander_anomalies` and (when severity = high) auto-fire the matching playbook from 6B.
  - Extends `agp-self-healing-watcher` with: failed AI generations sweep (`cpe_creative_jobs.status='failed' > 1 h`), duplicate-asset detection via `cj_media_asset_registry` checksum, missing-asset detection on `creative_assets`, storage HEAD probe on a sample, secret-expiry probe (no value reads), slow-query check via `supabase--slow_queries`, queue-stall checks for `pinterest_publish_queue`, `cinematic_v3_dispatch_queue`, `cpe_creative_jobs`.
- UI: **Memory**, **Forecasts**, **Anomalies** tabs on `/admin/agp-commander` — top patterns by win rate, forecast charts with CI ribbons + accuracy histogram, anomaly inbox with one-click "Run playbook" / "Suppress".
- Report: PDF + JSON.

## Sub-wave 6D — Executive Briefings + Continuous Optimisation + End-to-End Validation + Handbook

Goal: close the loop with executive-grade reporting, daily self-improvement, and the final validation gate.

- New tables:
  - `commander_briefings` — cadence (daily/weekly/monthly), period_start, period_end, summary jsonb, pdf_path, json_path, generated_at.
  - `commander_optimization_log` — target (prompt / schedule / allocation / queue / creative_diversity), before jsonb, after jsonb, evidence, applied_by ('auto' or operator id), reverted_at.
  - `commander_validation_runs` — phase (orchestration_e2e, one_week_sim, stress_test, ai_efficiency, cloud_efficiency, autoresolve_safe_issues, perf_optimize), status, evidence jsonb, started_at, finished_at.
- Edge functions:
  - `commander-briefing` — generates daily (cron `45 5 * * *`), weekly (`50 5 * * 1`), monthly (`55 5 1 * *`) executive PDFs to `public/admin-reports/executive/commander/{daily|weekly|monthly}/YYYY-MM-DD.pdf` and indexes them in the existing manifest.
  - `commander-self-improver` (cron `0 6 * * *`) — uses `commander_memory` + dispatch outcomes to propose updates to: AI prompts (CPE / Pinterest / cinematic), cron schedules, resource-pool weights, queue concurrency, creative-diversity quotas. Writes proposals to `commander_optimization_log` with `applied_by='auto'` only when guardrails pass; everything else stays as a proposed row for operator approval.
  - `commander-validate` — runs the seven validation phases in sequence: end-to-end orchestration dry-run, 7-day simulated operation against historical signals, concurrency stress test on queues/workers, AI-efficiency benchmark (cost-per-impact across last 30 days), cloud-efficiency benchmark, safe auto-resolve sweep, performance optimisation pass. Refuses to mark Wave 6 complete until every phase returns `ok`.
- UI: **Briefings**, **Optimisations**, **Validation** tabs on `/admin/agp-commander`; subscribe-by-email toggle for daily/weekly/monthly briefings (uses existing email infra, no new ESP integration).
- One-time deliverables: `public/admin-reports/agp-commander/technical-architecture.pdf` (with ASCII architecture diagram inside the PDF), `public/admin-reports/agp-commander/operator-handbook.pdf`, `public/admin-reports/agp-commander/executive-implementation.pdf`, `public/admin-reports/agp-commander/roadmap-next.pdf`.

## What I will NOT add in Wave 6 (out of scope, deferred)

- New external API integrations beyond what's already wired (Meta Ads management API, Google Ads management API, dedicated ESP). The Commander reads spend/perf from existing tables and dispatches into engines we already own.
- Replacing any AGP 1–5 engine. Wave 6 only observes, ranks, allocates, and dispatches.
- Storefront pricing/policy changes beyond what ARO + `src/config/pricing-policy.ts` already permit.
- Autonomous publishing beyond what existing publish governors (Pinterest, Cinematic V3, ARO) already allow.

## Execution order & reporting

I will execute **6A first**, generate its PDF + JSON, and stop. You then say **"run wave 6b"** to continue. Each sub-wave is ~1 turn of focused work and verifiable on its own.

Reply **"run wave 6a"** to start, or tell me to compress/reorder.

---

## Previous wave plan (for reference)

# AGP Wave 5 — Autonomous Revenue Optimizer (ARO)

Wave 5 is the **commercial intelligence layer** on top of AGP Waves 1–4, CPE, Pinterest Engine, Cinematic V3, CJ Media Pipeline, GSC, GA4, Growth Intelligence, and the Wave 4 Signal Lake / Growth Scorer / Recommender. It does not rebuild any of them. It reads their signals, computes profit-aware decisions, and (only for safe actions) auto-executes through existing engines.

Per the same delivery rule we used for Wave 4, Wave 5 ships as **four sub-waves**. Each is independently usable, leaves the system working, and produces a PDF+JSON report.

## Sub-wave 5A — Profit Lake + Live Business Dashboard (foundation)

Goal: one canonical commercial-truth layer every ARO decision reads from.

- New tables (all RLS-locked, admin/service_role only):
  - `aro_product_economics` — per-product per-day: selling_price, supplier_cost, shipping_cost, platform_fees, payment_fees, ad_cost_allocated, ai_cost_allocated, cloud_cost_allocated, refund_risk, return_rate, inventory_age_days, gross_margin, net_margin, contribution_margin, profit_score, priority_tier (scale/maintain/improve/watch/liquidate/archive).
  - `aro_business_kpis_daily` — revenue, gross_profit, net_profit, margin, orders, visitors, cvr, aov, rpv, roas, mer, marketing_spend, ai_spend, cloud_spend, inventory_value, inventory_velocity, business_health_score (0–100).
  - `aro_channel_economics_daily` — channel (pinterest/google/meta/email/organic/referral/direct), spend, revenue, orders, roas, mer, contribution_to_profit.
  - `aro_settings` (singleton) — autonomous mode flags, daily/weekly/monthly caps, min-margin rules, max-price-change %, approval thresholds.
- Edge functions:
  - `aro-economics-collector` (cron 02:15 UTC) — joins `orders` + `products` + `gi_channel_performance_daily` + `cpe_creative_jobs` + Wave-4 `agp_signals_daily` to write `aro_product_economics`. Cost allocation uses existing `pricing.ts` helpers plus deterministic platform-fee model (2.9 % + $0.30 baseline, configurable).
  - `aro-business-scorer` (cron 02:45 UTC) — rolls product economics into `aro_business_kpis_daily` + `aro_channel_economics_daily` and computes business_health_score.
- UI: new **Live Business Dashboard** at `/admin/revenue-optimizer` — KPI hero (Revenue today / week / month, gross profit, net profit, margin, RPV, MER, business score), channel-economics table, top-50 product profit leaderboard with priority badge.
- Report: PDF + JSON to `public/admin-reports/ai-implementation/`.

## Sub-wave 5B — Dynamic Pricing + Promotion Engine

Goal: turn the profit lake into safe, reversible price + promo recommendations.

- New tables:
  - `aro_pricing_recommendations` — product_id, current_price, recommended_price, delta_pct, reason, projected_revenue_delta, projected_profit_delta, confidence, risk, status (proposed/approved/applied/reverted), applied_at, reverted_at, undo_ref.
  - `aro_promotions` — type (bundle/qty_discount/bxgy/cross_sell/upsell/free_ship_threshold/limited_time/seasonal/clearance/launch), target, projected_revenue, projected_profit, status, eligibility_window.
  - `aro_price_change_log` — full audit trail of every price write.
- Edge function `aro-pricing-engine` (cron 03:15 UTC) — uses `src/lib/commerce-intelligence/pricing-intelligence.ts` + `demand-prediction.ts` (already in repo) + `aro_settings` guardrails (min margin, max ±N %). Approval-mode by default; autonomous mode only when `confidence ≥ 0.85 ∧ risk = low ∧ within caps`.
- Edge function `aro-promotion-engine` (cron 03:30 UTC) — generates bundle / cross-sell / threshold promos from existing `product_bundles`, `dog-bed-companions`, `training-bundle-pairs`, and per-product margin headroom. Emits to `aro_promotions` for operator review.
- UI: **Pricing** and **Promotions** tabs on `/admin/revenue-optimizer` — table with approve/reject/snooze, bulk-approve safe ones, one-click revert (uses `undo_ref` → `aro_price_change_log`). Read-only `PRICING_DISPLAY_MODE` policy in `src/config/pricing-policy.ts` is respected; storefront still renders via existing canonical helpers.
- Report: PDF + JSON.

## Sub-wave 5C — Budget Allocator + Customer & Inventory Intelligence + Forecasting

Goal: shift money toward the highest-ROI channel and prioritise the right products/customers.

- New tables:
  - `aro_budget_allocations` — date, channel, current_budget, recommended_budget, delta, projected_roas, projected_profit, status.
  - `aro_customer_segments` — user_id (nullable for anon cohort), segment (new/returning/vip/high_value/dormant/at_risk/frequent/window_shopper), ltv_predicted, churn_prob, next_order_prob, expected_30d_revenue.
  - `aro_inventory_intelligence` — product_id, velocity_class (fast/slow/dead), days_of_cover, reorder_at, oos_risk, supplier_delay_days.
  - `aro_forecasts` — metric, horizon_days, value, ci_low, ci_high, generated_at.
- Edge functions:
  - `aro-budget-allocator` (cron 03:45 UTC) — reads `aro_channel_economics_daily` (30-day window), recommends ±N % budget shifts subject to `aro_settings` daily/weekly/monthly caps. Auto-apply gated by confidence/risk like 5B.
  - `aro-customer-segmenter` (cron 04:00 UTC) — reads `orders` + `sessions` + `visitor_activity` to populate segments and LTV/churn predictions (deterministic recency-frequency-monetary + Gemini-3-flash for natural-language reasoning summaries; no per-row LLM call).
  - `aro-inventory-brain` (cron 04:15 UTC) — joins `product_global_inventory` + recent sales velocity to score reorder timing and OOS risk; pushes high-priority products into existing CPE + Pinterest queues with `priority_boost=1.5x`.
  - `aro-forecaster` (cron 04:30 UTC) — EWMA + seasonal naïve baseline forecasts for revenue, orders, traffic, profit, inventory, ad/AI/cloud spend, with 80 % CIs. Continuously logs prediction-vs-actual to feed 5D learning.
- UI: **Budget**, **Customers**, **Inventory**, **Forecast** tabs on `/admin/revenue-optimizer` — channel reallocation grid with approve button, segment distribution + top VIP/at-risk lists, slow-mover & reorder table, 30/60/90-day forecast chart with CI ribbons.
- Report: PDF + JSON.

## Sub-wave 5D — A/B Engine + Risk Manager + Self-Optimisation + Operator Handbook

Goal: close the learning loop, harden the safety net, and ship the executive deliverables.

- New tables:
  - `aro_experiments` — type (price/title/desc/lifestyle/pin/video/cta/landing/bundle/promo), hypothesis, variants jsonb, traffic_split, metric, status, started_at, ended_at, winner, p_value, lift_pct.
  - `aro_experiment_events` — exposures + conversions, used for sequential-testing p-value.
  - `aro_risk_signals` — type (margin_erosion / overspend / budget_anomaly / cvr_drop / traffic_drop / revenue_drop / supplier_issue / inventory_shortage / creative_fatigue / pinterest_fatigue / seo_decline), severity, evidence jsonb, recommended_action, status.
  - `aro_learning_memory` — extends Wave-4 `agp_learning_memory` with revenue/profit-weighted EWMA per dimension (price_band, promo_type, creative_style, channel, segment).
- Edge functions:
  - `aro-experiment-orchestrator` — creates experiments from queued recommendations in 5B/5C, allocates traffic via existing UTM/session infra, evaluates with sequential-testing (mSPRT); auto-rolls winners through the same approve/apply path as 5B.
  - `aro-risk-watcher` (cron `*/30 * * * *`) — extends Wave-1 `agp-self-healing-watcher` with the 11 risk checks above; writes `aro_risk_signals`, sends Twilio alert through existing `order_sms_alerts` infra when severity = high.
  - `aro-self-optimizer` (cron 05:00 UTC) — EWMA update on `aro_learning_memory` from `aro_experiment_events` + `aro_pricing_recommendations` + `aro_promotions` + Pinterest/GSC revenue attribution. Feeds back into 5B/5C scorers.
  - `aro-executive-report` (cron 05:30 UTC) — daily executive PDF (revenue, profit, marketing, inventory, AI/cloud spend, forecast, operator recommendations) saved to `public/admin-reports/executive/YYYY-MM-DD.pdf` and indexed in the existing manifest.
- UI: **Experiments** + **Risk** tabs on `/admin/revenue-optimizer`; **Executive Reports** section linking to daily PDFs from Admin → Reports.
- Deliverables (one-time): `public/admin-reports/aro/operator-handbook.pdf`, `public/admin-reports/aro/technical-architecture.pdf`, `public/admin-reports/aro/commercial-impact-12mo.pdf` (uses 30-day baseline from 5A/5C forecasts to project 12-month revenue uplift, profit uplift, cost savings, expected ROI with confidence band).
- End-to-end validation: `aro-wave5-smoke` edge function exercises every collector/scorer/engine in dry-run, asserts row counts and schemas, and refuses to mark complete until every component returns `ok`.

## What I will NOT add in Wave 5 (out of scope, deferred)

- New external API integrations beyond what's already wired (Meta Ads spend API, Google Ads management API, email service provider). Wave 5 reads spend numbers from existing tables; pushing budget changes back to ad platforms requires those connectors and stays in Wave 6+.
- Replacing any existing engine. Wave 5 only orchestrates and adds the commercial layer.
- Storefront pricing-policy changes beyond what `src/config/pricing-policy.ts` already allows.

## Execution order & reporting

I will execute **5A first**, generate its PDF + JSON, and stop. You then say **"run wave 5b"** to continue. Each sub-wave is ~1 turn of focused work and verifiable on its own.

Reply **"run wave 5a"** to start, or tell me to compress/reorder.

---

## Previous wave plan (for reference)

# AGP Wave 4 — Autonomous Marketing Brain V1

Wave 4 is the central intelligence layer that sits **on top of** AGP Waves 1–3, CPE, Pinterest Engine, Cinematic V3, CJ Media Pipeline, GSC, GA4, and Growth Intelligence. It does not rebuild any of them. It reads their signals, scores them, generates ranked recommendations, and (only for safe actions) auto-executes through existing engines.

Given the scope, I am proposing Wave 4 as **four shippable sub-waves**. Each sub-wave is independently usable, leaves the system in a working state, and produces a PDF+JSON report per the standing rule. I will not try to ship all of it in one run — that would create unverified, half-wired code, which violates the "no placeholder, no TODO, production-ready" requirement in your brief.

## Sub-wave 4A — Signal Lake + Growth Score (foundation)

Goal: one canonical place every brain decision reads from.

- New tables (all RLS-locked, admin/service_role only):
  - `agp_signals_daily` — per-day rollup of: Pinterest (impressions, saves, CTR, revenue), GSC (clicks, impressions, CTR, position), GA4 (sessions, ATC, checkouts, purchases, revenue), CJ (in-stock %, OOS count), Catalog (active count, creative_ready %, media coverage %), CPE (jobs run, $ spent, QA pass rate), Cinematic V3 (renders, success rate).
  - `agp_growth_scores` — daily 0–100 overall + 13 subscores (SEO, Pinterest, Media, Creative, Conversion, Performance, Product Quality, Catalog Health, Traffic, Revenue, Automation, AI Efficiency, Trend Direction) + deltas vs 1d/7d/30d/90d.
  - `agp_product_health` — per-product score: media_quality, pinterest_ready, seo_ready, creative_quality, video_avail, lifestyle_avail, qa_score, ctr, cvr, revenue_30d, priority_tier (S/A/B/C/D), recommended_actions[].
- New edge function `agp-signal-collector` (cron 02:00 UTC) — pulls from existing tables only (no new external API calls in 4A); writes the three tables above.
- New edge function `agp-growth-scorer` (cron 02:30 UTC) — computes scores from `agp_signals_daily` + `product_intelligence` + `creative_assets` + `pinterest_*` tables.
- UI: extend `/admin/autonomous-growth` with a "Growth Score" hero card + 13 subscore sparklines + per-product health leaderboard.
- Report: PDF/JSON to `public/admin-reports/ai-implementation/`.

## Sub-wave 4B — Recommendation Engine + Task Generator

Goal: turn signals into ranked, costed, reversible tasks.

- New tables:
  - `agp_recommendations` — id, source_signal, action_type (enhance_image, gen_lifestyle, gen_pin, gen_cinematic, rewrite_title, rewrite_desc, gen_faq, etc.), target (product_id / collection / page), priority (0–100), expected_revenue_cents, expected_traffic, est_ai_credits, est_cloud_usd, confidence (0–1), risk (low/med/high), expected_roi, eta_minutes, status (proposed/approved/queued/running/done/failed/skipped), reversible (bool), undo_ref jsonb, created_at, decided_by.
  - `agp_decision_log` — every auto/manual decision with reasoning jsonb.
- New edge function `agp-recommender` (cron 03:00 UTC) — reads `agp_product_health` + `agp_signals_daily`, emits recommendations using a deterministic rule engine + Gemini-3-flash for natural-language reasoning summaries. Hard cap: 200 recs/run.
- Auto-execution rule: only `confidence ≥ 0.8 AND risk = low AND est_ai_credits ≤ agp_settings.auto_credit_cap AND positive expected_roi` → enqueue into existing `cpe_creative_jobs` or `pinterest_publish_queue`. Everything else → status=`proposed`, waits for approval.
- UI: `/admin/autonomous-growth` gets a "Recommendations" tab — table with filters, approve/reject/snooze, bulk-approve safe ones, undo button (uses `undo_ref`).
- Report: PDF/JSON.

## Sub-wave 4C — Self-Learning Memory + Budget Intelligence

Goal: brain gets smarter over time, never overspends.

- New tables:
  - `agp_learning_memory` — dimension (e.g. `pin_hook`, `pin_color`, `cta_copy`, `image_model`, `enhance_preset`, `board_id`, `category`), value, n_observations, n_wins, win_rate, revenue_per_impression, last_updated. Updated nightly by `agp-learner` from `pinterest_pin_performance`, `gi_creative_performance_daily`, `cpe_qa_results`, `creative_performance_snapshots`.
  - `agp_budget_ledger` — daily AI credits spent per engine (cpe, cinematic, recommender, pinterest), cap, projected month-end.
- New edge function `agp-learner` (cron 04:00 UTC) — EWMA update on win rates; promotes/demotes patterns; feeds back into recommender via `agp_learning_memory` lookups (the recommender in 4B reads memory if present).
- New edge function `agp-budget-guard` (runs before every auto-exec) — blocks execution if projected month spend > `agp_settings.monthly_ai_budget_usd`; downgrades model selection (gpt-5 → gemini-3-flash) when ROI allows.
- UI: Budget panel on `/admin/autonomous-growth` (daily/monthly spend, projection, kill switch); Learning panel (top patterns by win rate per dimension).
- Report: PDF/JSON.

## Sub-wave 4D — Self-Healing + Operator Manual + End-to-End Validation

Goal: brain detects its own failures and ships a manual.

- Extend existing `agp-self-healing-watcher` with new checks: stuck `agp_recommendations` (running > 60m), broken creative_assets URLs (HEAD check), missing pinterest_url on done pins, expired secrets (probe-only), GSC token health, Cinematic V3 stuck jobs.
- Smoke-test edge function `agp-wave4-smoke` — exercises signal collector, scorer, recommender, learner, budget guard in dry-run; asserts row counts and schema.
- Operator manual at `public/admin-reports/agp/operator-manual.pdf` — covers daily/weekly/monthly checks, kill switches, approval workflow, budget tuning, escalation runbook.
- Final Wave 4 PDF report with architecture diagram (ASCII in PDF), cost breakdown, KPI baseline snapshot, and "next wave" recommendation.

## What I will NOT add in Wave 4 (out of scope, deferred)

- New external API integrations beyond what's already wired (Meta Ads, Google Ads asset generation, email service provider). The brief lists "Generate Meta creatives / Google Ads assets / email campaign" — those require their own connectors and will be Wave 5+.
- Replacing any existing engine. Wave 4 only orchestrates.
- Auto-publishing pins/videos beyond what existing engines already do — Wave 4 only enqueues; existing publish governors stay authoritative.

## Execution order & reporting

I will execute **4A first**, generate its PDF+JSON, and stop. You then say "run wave 4b" to continue. Each sub-wave is ~1 turn of focused work and verifiable on its own.

Reply **"run wave 4a"** to start, or tell me to compress/reorder.
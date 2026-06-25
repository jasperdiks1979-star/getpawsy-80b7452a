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

# Wave 5X — Autonomous Commerce Intelligence (ACI)

Builds the commercial brain on top of Waves 1–4A+. Nothing existing is replaced; ACI consumes Signal Lake, Growth Scores, Product Opportunity, CJ Media, Pinterest, Cinematic V3, QA, and AI Enhancement outputs and decides what happens next.

The scope is huge, so it ships in 5 stages so each is verifiable, idempotent, observable and reversible. You approve once; I run them in order in a single autonomous loop and ship one consolidated PDF + JSON report at the end (plus a per-stage JSON checkpoint).

────────────────────────────────────

## Stage 5X-A — Foundations, Operator Controls, Kill Switches

**Schema (1 migration, admin-only RLS + service_role grants):**
- `aci_settings` — kill_switch, mode (`auto`/`approval`/`simulation`/`dry_run`), daily_ai_budget_usd, daily_cloud_budget_usd, max_tasks_per_day, autonomy_level (0–5).
- `aci_runs`, `aci_run_steps` — per-engine run log (mirrors agp_runs shape).
- `aci_audit_log` — every autonomous decision (actor, engine, action, payload, before/after, reversible_token).
- `aci_budget_ledger` — daily ai_usd / cloud_usd spend per engine, hard-capped from settings.
- `aci_approvals` — pending operator approvals (task_id, risk, expected_revenue, expires_at).
- `aci_rollbacks` — reversible action snapshots.

**Edge function:** `aci-guardrails` — single source of truth: every other ACI function calls `check(engine, est_cost_usd)` before executing; returns `allow`/`deny`/`require_approval`. Enforces kill switch, budget, mode.

**UI:** `/admin/autonomous-commerce` skeleton + Operator Controls panel (kill switch, mode selector, budget sliders, autonomy slider, emergency stop, rollback list, audit log viewer).

────────────────────────────────────

## Stage 5X-B — Intelligence Engines (read-only signal layer)

All write to new tables only. No mutation of products/Pinterest/SEO yet.

**Schema:**
- `aci_market_signals` — source, signal_type (trend/keyword/category/product), entity, score, velocity, confidence, expected_lifetime_days, seasonality, payload, captured_at.
- `aci_competitors` — domain, niche, discovered_at, threat_score, last_scanned_at.
- `aci_competitor_snapshots` — daily diff per competitor: prices, new_products, top_pages, media_quality, seo_score, pinterest_visibility.
- `aci_competitor_gaps` — per (competitor, axis): price/media/seo/content/trust/conversion/overall.
- `aci_product_opportunity_v2` — extends Wave 4A+ opportunity with 18 components incl. trend_score, demand_score, competition_score, seasonality, media_gap, seo_gap, expected_revenue_increase_cents, expected_ctr_delta_pct, expected_pinterest_delta_pct, expected_seo_delta_pct, investment_priority, expected_roi.
- `aci_revenue_intelligence` — per product per day: profit_cents, margin_pct, shipping_cost_cents, conversion_pct, refund_risk, ad_roi, ltv_cents, dead_inventory_flag, lost_revenue_cents.
- `aci_forecasts` — horizon (7/30/90/180/365), metric (category/keyword/pinterest/traffic/sales/revenue), entity, predicted, low, high, confidence, model_version.

**Edge functions (8, service-role, all gated by `aci-guardrails`):**
1. `aci-market-intel` — Firecrawl v2 + Google Trends (via existing connector), Pinterest Trends, Amazon/Chewy/Etsy/Temu/Ali/TikTok/Instagram/YouTube/Reddit/pet-blogs/vet-news scrapers (rate-limited, cached 24h). 25 sources max/run, hard cap 200 signals/run.
2. `aci-competitor-discovery` — Semrush competitive_analysis + Firecrawl map to auto-discover competitors; writes `aci_competitors`.
3. `aci-competitor-monitor` — daily snapshot per competitor (price/media/SEO/Pinterest/shopping); writes snapshots + gap scores.
4. `aci-opportunity-v2` — joins everything (Growth Score, Pinterest, GA4, GSC, CJ, inventory, margins, price, CTR, CVR, revenue, media quality, AI enhancement, reviews, trends, demand, competition, seasonality) → `aci_product_opportunity_v2`.
5. `aci-revenue-intel` — profit, margin, shipping, conversion, refund risk, ad ROI, LTV, monthly/quarter/annual forecast, lost-revenue + profit-leak + dead-inventory detection.
6. `aci-trend-forecaster` — EWMA + linear regression + seasonal decomposition over 90d signals for 7/30/90/180/365 horizons.
7. `aci-learning-engine` — replays operator approvals/rejections + downstream outcomes; updates `aci_score_weights` (bounded ±5%/day per axis), writes `aci_learning_events`.
8. `aci-intelligence-orchestrator` — runs 1→7 in order, idempotent per day.

**AI:** Lovable AI Gateway, `google/gemini-3-flash-preview` only, ≤ 8 calls/orchestrator run (~$0.10/day cap).

────────────────────────────────────

## Stage 5X-C — Recommendation + Task Generator (decision layer)

**Schema:**
- `aci_recommendations` — engine, recommendation_type, entity, expected_revenue_cents, expected_profit_cents, confidence, priority (critical/high/medium/low/ignore), risk, ai_cost_usd, cloud_cost_usd, completion_minutes, dependencies jsonb, status.
- `aci_tasks` — task_type (enhance_image/cinematic_video/pinterest_publish/seo_rewrite/blog/title/description/price_change/faq/collection/ab_test), payload, status, requires_approval, recommendation_id, run_id, output jsonb.

**Edge functions:**
- `aci-recommender` — turns Stage B outputs into typed recommendations; auto-classifies priority via expected revenue × confidence / cost.
- `aci-task-generator` — converts approved/auto-eligible recommendations into executable `aci_tasks` and dispatches to existing engines (CPE image enhancer, Cinematic V3, Pinterest Autopilot, SEO writer, copy engine). Honors mode: `approval` queues to `aci_approvals`, `auto` dispatches immediately, `simulation`/`dry_run` writes intent only.

**Critical safety:** every dispatch is wrapped in `aci_rollbacks` snapshot first; price changes always require approval regardless of autonomy level.

────────────────────────────────────

## Stage 5X-D — Executive Dashboard + UI (`/admin/autonomous-commerce`)

11 panels (lazy-loaded, virtualized tables, all data fetched from new tables):
1. Executive Score + Business Health hero
2. Revenue Forecast (7/30/90/180/365)
3. Opportunity Queue (top 50, sortable)
4. Highest ROI Tasks
5. Competitor Alerts + threat map
6. Trending Products / Categories / Keywords
7. Market Signals stream
8. Recommendations inbox with approve/reject
9. Cost & ROI (AI + cloud spend vs budget)
10. Pipeline + Learning status (engines, last run, confidence)
11. Operator Controls + Audit Log + Rollback

Reuses existing `Wave4PlusIntelligencePanel` patterns; adds `Wave5XCommerceBrainPanel.tsx` + 11 sub-components.

────────────────────────────────────

## Stage 5X-E — Cron, End-to-End Validation, Reports

**Cron (via supabase--insert, single job):**
`03:30 UTC` daily → `aci-intelligence-orchestrator` → `aci-recommender` → `aci-task-generator` (mode-aware) → `aci-learning-engine`.

**Validation:**
- Dry-run full pipeline → live run with `mode='simulation'` → assert every new table has today rows.
- Playwright screenshots of all 11 panels at 1280×1800.
- Verify guardrails: trip kill switch → assert all engines refuse; trip budget → assert recommender denies.

**Reports (per standing rule, all under `public/admin-reports/ai-implementation/`):**
- `2026-06-25-wave-5x-aci.pdf` + `.json` — full implementation report (exec summary, files, DB, APIs, AI/cloud cost, security, scorecard).
- Sub-reports embedded as appendix sections: Architecture · Database · Cron · API · Cost Projection · Risk Analysis · Business Value Projection · Deployment · Production Readiness.
- `manifest.json` prepended.

────────────────────────────────────

## Cost & safety summary
- AI: ≤ $0.10/day at default settings; hard-capped by `aci_budget_ledger`.
- Cloud: scrapers cached 24h, Firecrawl cap 25 URLs/run, Semrush ≤ 5 calls/run.
- No price mutations without explicit approval. No Pinterest publishes from this wave directly — only via existing autopilot which already has its own guardrails.
- All new tables admin-only; service_role for edge functions; no anon access.
- Default mode on first deploy: `simulation` (writes intents, dispatches nothing) so you can review before flipping to `auto`.

## Deliverables checklist
- 1 migration (≈ 15 tables + grants + RLS + cron)
- 11 edge functions
- 1 dashboard page + 11 panels + Operator Controls
- Live validation (simulation mode) + screenshots
- Implementation PDF + JSON + manifest entry

Approve to execute Stages A→E end-to-end in one autonomous run. Default mode will be `simulation`; flipping to `auto` is a one-click toggle in Operator Controls afterwards.

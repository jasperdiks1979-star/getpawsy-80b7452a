---
name: Pinterest Growth Engine
description: Autonomous daily orchestrator — product selection, variant generation, safe auto-approval, dashboard at /admin/pinterest-growth-engine
type: feature
---
**Edge function:** `pinterest-growth-engine` (service-role, no JWT). Actions: `run`, `dashboard`, `status`. Revenue-optimized.

**Daily cron:** id 119 `pinterest-growth-engine-daily` at 13:00 UTC → POST `{"action":"run"}`.

**Run flow:** select top-N active products using composite score (image + margin + price-band + Pinterest engagement 0–25 + **revenue/ATC/purchase boost 0–50** from `pinterest_revenue_funnel_daily` 14d). Respect `pinterest_autopilot_overrides`: `paused`/`exclude` skipped, `force_promote` bypasses the 5-day recency throttle and adds +40 bonus. Call `pinterest-creative-director` per product → auto-approve safe drafts (production board, image+link present, active product, intel.total ≥ 78, per-board cap 3) → archive draft variants of loser-verdict products.

**Revenue alerts:** `pinterest-revenue-alerts` (cron id 120, `20 */6 * * *`) raises `monitoring_alerts` rows with `category='pinterest'` for: CTR drop >30% wow, conv-rate drop >40% wow, traffic spike >2× 7d avg, force-promoted products gone inactive, posted pins with null image/link. Auto-resolves stale alerts.

**Safety guardrails (hard halt if violated):** no sandbox boards, no missing image, no missing destination, no inactive products, no products without slug. Run is aborted with HTTP 412 `NO_PRODUCTION_BOARDS` when no production board exists.

**Dashboard:** `/admin/pinterest-growth-engine` — today's published, 7d/30d impressions/clicks/saves/CTR + revenue/ATC/conv funnel, ROAS proxies (revenue per 1000 impressions, revenue per click), revenue by board, revenue by pin (top 20), top 20 winning products by 30d revenue, 14d trend table, "Run Now" button.

**Defaults:** productsPerRun=8, variantsPerProduct=3, perBoardDailyCap=3, autoApproveScoreThreshold=78, minMarginPct=0.25. Override via POST body.

**Run log:** `pinterest_evolution_log` rows with `decision_type='growth_engine_run'` and full report in `metrics` jsonb. Run report also returns `forcePromoted[]` and `excludedProductCount`.

---
name: Pinterest Revenue Brain
description: Per-product RevenueOpportunityScore (0-1000) + forecast + auto-promotion across all Pinterest engines
type: feature
---
**Edge function:** `pinterest-revenue-brain` (service-role). Actions: `score`, `trends`, `auto_promote`, `report`, `run_full`.

**Cron:** id 130, `45 3 * * *` UTC (30 min after Competitor Intel).

**Tables:**
- `pinterest_revenue_opportunity_scores` — per-product score 0-1000, components jsonb, bestseller/viral/repeat probabilities, tier (`winner`/`high_opp`/`watch`/`neutral`/`skip`).
- `pinterest_revenue_forecasts` — 7/30/90 day sessions/ATC/checkouts/purchases/revenue_cents.
- `pinterest_trend_intelligence` — keyword velocity/direction/seasonality/growth per source (internal proxy; Pinterest/Google Trends APIs gated).
- `pinterest_revenue_brain_runs` — audit log.

**Score weights:** competitor 15 + engagement 12 + margin 12 + price 8 + reviews 8 + demand 10 + trend 12 + saturation⁻¹ 6 + traffic 5 + inventory 4 + cvr 8.

**Auto-promote:** score≥700 → priority=95 on queued pins + `pinterest-creative-director` (10 image + 3 video drafts, source=revenue_brain). Cap 25/run.

**Dashboards:** `/admin/revenue-brain` (top 100 + filters), `/admin/revenue-report` (7/30/90 forecast + top 20 + CSV).

**Safety:** No competitor asset copy. UTM `utm_campaign=revenue_brain`. Reuses Spy/Growth/Brain/Competitor Intel — no duplicate systems.
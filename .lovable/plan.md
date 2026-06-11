## Pinterest Revenue Brain (Phase 5)

Surgical extension. Reuses Spy, Growth Engine, Brain, Competitor Intel, Product Tiers, Creative Director, Publisher, Forecasts. No rebuilds.

### 1. Reuse map (no changes)
- `pinterest_competitor_pins/_patterns/_opportunities` → competitor strength signal
- `pinterest_pin_performance`, `pinterest_pin_predictions`, `pinterest_product_tiers` → engagement + bestseller priors
- `pinterest_keyword_bank`, `pinterest_trend_signals` → trend momentum + saturation
- `pinterest_forecasts`, `pinterest_pdp_conversion_stats` → conversion + forecast base
- `products` → margin_percent, price, review_count, rating, inventory, is_active
- `pinterest-creative-director`, `pinterest-growth-brain`, publisher queue → auto-promotion path

### 2. New DB (one migration)
- `pinterest_revenue_opportunity_scores` — `product_id (uniq)`, `slug`, `score_0_1000`, `components jsonb` (12 weighted inputs), `bestseller_p`, `viral_p`, `repeat_p`, `tier` (`high_opp`/`winner`/`neutral`/`watch`/`skip`), `computed_at`. Index on `(score_0_1000 desc)`.
- `pinterest_revenue_forecasts` — `product_id`, `horizon` (7/30/90), `sessions`, `atc`, `checkouts`, `purchases`, `revenue_cents`, `confidence`, `computed_at`. Unique `(product_id, horizon)`.
- `pinterest_trend_intelligence` — `keyword`, `source` (`pinterest`/`google`/`internal`), `velocity` (-1..1), `direction` (`rising`/`stable`/`declining`), `seasonality_score`, `growth_rate`, `computed_at`. Unique `(keyword, source)`.
- `pinterest_revenue_brain_runs` — counters, top_products jsonb, health flags.
- GRANT + RLS (admin read, service_role full) for all four.

### 3. New edge function `pinterest-revenue-brain`
Actions: `score`, `forecast`, `trends`, `mine_opportunities`, `auto_promote`, `run_full`, `report`.
- **Score (0–1000)** weighted sum:
  - competitor_success 15%, engagement 12%, margin 12%, price_competitiveness 8%, reviews(count+rating) 8%, demand 10%, trend_momentum 12%, saturation_inverse 6%, current_traffic 5%, inventory 4%, conversion_rate 8%.
- **Bestseller/viral/repeat probs** — logistic blend of (purchases_30d, viral_p from predictions, repeat_buyer ratio from orders).
- **Forecast** — `sessions = max(current_daily,1) * horizon * trendBoost(score)` then funnel via `pdp_conversion_stats` rates, fallback global 1.2% CTR / 2.5% CVR / AOV $35.
- **Trends** — pulls `pinterest_trend_signals` + `pinterest_keyword_bank` deltas (Google/Pinterest Trends are gated → use internal click/impression deltas as proxy, mark source).
- **Auto-promote** when score>700: set `priority=95` on existing queued pins, call `pinterest-creative-director` with `count=10` + `video_count=3` + `source=revenue_brain`, expand board list via existing routing map. Caps: max 25 promotions/run.
- **Mine_opportunities** — `competitor_success≥70 AND saturation<0.3 AND trend.velocity>0 AND margin≥0.3` → tag `high_opp`.
- All work batched, 8-min cap, dry_run supported.

### 4. Cron
Reuse `pg_cron`, `45 3 * * *` UTC (30 min after Competitor Intel).

### 5. Admin UI
- **New `/admin/revenue-brain`** (`RevenueBrainPage.tsx`) — top 100 table (product, score, margin, trend, comp strength, saturation, traffic potential, revenue potential), filter chips, Run/Dry-run buttons, last-run card.
- **New `/admin/revenue-report`** (`RevenueReportPage.tsx`) — daily report: top winners, fastest rising, 7/30/90 traffic+revenue forecast totals, recommended actions list, CSV export.
- Widget on `/admin/pinterest-growth` and `/admin/pinterest-spy`: top 5 revenue opps + link.
- Register both routes in `src/App.tsx` (lazy).

### 6. Safety (unchanged invariants)
No competitor asset copy. Generator gets only pattern hints. UTM `utm_campaign=revenue_brain`. Honors queue type contract + visual dedupe + warm-up budget + board governance.

### 7. Files
- create `supabase/functions/pinterest-revenue-brain/index.ts`
- create `src/pages/admin/RevenueBrainPage.tsx`, `src/pages/admin/RevenueReportPage.tsx`
- create migration (4 tables + grants + RLS + cron)
- create `mem/marketing/pinterest-revenue-brain.md`
- edit `src/App.tsx` (2 lazy routes)
- edit `.lovable/plan.md`
- untouched: publisher, creative director core, growth orchestrator/brain, competitor intel, spy page

### 8. Validation
Run `run_full` (dry) on full catalog → confirm score rows ≥ active products, ≥1 high_opp, forecast rows present for top 100, auto-promote dry returns target ids without writing. Then live run on top 25 only. Final report.

### 9. Out of scope
No Pinterest Trends API (gated). No new image gen pipeline. No publisher cadence change. No deletes.

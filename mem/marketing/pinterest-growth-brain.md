---
name: Pinterest AI Growth Brain (Phase 3)
description: Nightly meta-orchestrator that predicts winner/revenue/viral probability per pin, refreshes 5-bucket revenue ranking, amplifies winners, and discovers high-margin opportunities
type: feature
---
**Edge function:** `pinterest-growth-brain` (service-role). POST `{dry_run:true|false}`.

**Cron:** id 128, `45 2 * * *` UTC — runs 30 min before existing `pinterest-growth-orchestrator`.

**Tables:** `pinterest_pin_predictions` (winner_p, revenue_p, viral_p, inputs jsonb, model_version), `pinterest_brain_runs`, `pinterest_brain_actions`. Added columns on `pinterest_product_tiers`: `discovery_source`, `pdp_strength_score`, `revenue_bucket`.

**Buckets (revenue_bucket):** `viral_winner` (viral_p≥0.7) · `revenue_winner` (revenue_p≥0.7) · `emerging` (winner_p 0.4–0.7) · `hidden_opportunity` · `underperformer` (winner_p<0.25).

**Amplifier:** for pins with winner_p>0.70 OR revenue_p>0.70, calls `pinterest-creative-director` with `count=10, seo_mode=true, trending_keywords[]` (top 3 from `pinterest_trend_signals`), persists 5 title + 5 description variants to `pinterest_title_variants` / `pinterest_creative_variants`. Hard caps: 120 drafts, 50 flips per run.

**Discovery:** scans `products` where `is_active=true AND margin_percent>=0.30 AND image_url IS NOT NULL` with `pin_count_30d<3`. Top 20 upserted into `pinterest_product_tiers` with `discovery_source='catalog_scan'`.

**Dashboard:** `/admin/pinterest-brain` — 5-bucket counts, last run summary, top-20 pins by winner_p, recent runs, Dry-run + Run-now buttons.

**Safety:** never DELETEs anything; only inserts predictions and flips tier columns. Publisher cadence (warm-up + 90-min gap) remains authoritative.
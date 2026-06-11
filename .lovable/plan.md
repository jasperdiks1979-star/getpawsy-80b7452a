
# Pinterest AI Growth Brain (Phase 3)

Upgrade the existing `pinterest-growth-orchestrator` + dashboards from a traffic engine to a **revenue-optimizing AI brain**. Reuse — don't replace — what's already live: `pinterest-growth-orchestrator`, `pinterest-growth-engine`, `pinterest-revenue-ai`, `pinterest-creative-director`, `pinterest-intelligence-api`, `pinterest_pin_queue`, `pinterest_analytics_daily`, `pinterest_pin_performance`, `pinterest_visitor_revenue_scores`, `pinterest_opportunity_ranks`, `pinterest_forecasts`, `pinterest_product_tiers`, US optimization rules, queue type contract, board governance.

Most of what the user asked for is **already built** under different names. Phase 3 wires them into one autonomous brain and fills the real gaps.

## Gap analysis vs. request

| User ask | Already covered by | Status |
|---|---|---|
| 1. Impression Intelligence | `pinterest_analytics_daily` hourly sync + `pinterest-intelligence-api` | ✅ keep |
| 2. Winner Prediction AI | `pinterest_opportunity_ranks` + `growth_forecasts` | ⚠ extend with composite probability scores |
| 3. Auto Amplification | `pinterest-growth-orchestrator` winner amplifier (5 drafts) | ⚠ scale to 10img + 5vid + 5title + 5desc |
| 4. Product Discovery Engine | orchestrator opportunity miner + `pinterest-growth-engine` margin scoring | ⚠ add daily catalog scan with image-quality + PDP-strength gates |
| 5. Pinterest Trends Integration | `pinterest_trend_signals` table + `trend-harvester` cron (US calendar) | ⚠ wire trending keywords into copy generator |
| 6. Revenue Ranking | `pinterest_revenue_funnel_daily` + `pinterest_opportunity_ranks` rank_tier | ⚠ add 5-tier category bucket |
| 7. Autonomous Publishing | publisher cron + warm-up + 90-min gap | ✅ keep |
| 8. AI Executive Dashboard | `/admin/pinterest-growth`, `/admin/revenue-ai`, `/admin/pinterest-intelligence` | ⚠ add unified `/admin/pinterest-brain` |
| 9. Safety | SHA-256 dedupe + warm-up cap + `pinterest_loser_blocklist` | ✅ keep |
| 10. Self Learning | nightly orchestrator + `pinterest-revenue-ai loop` 6h | ✅ keep |

## What gets built

### 1. Edge function: `pinterest-growth-brain` (the unified nightly meta-orchestrator)
One function, idempotent, runs nightly at **02:45 UTC** via `pg_cron` — 30 min before `pinterest-growth-orchestrator`. Steps in order:

1. **Sync analytics** — invoke existing `pinterest-analytics-sync` if last sync > 12h old.
2. **Winner Prediction AI** — for each pin in `pinterest_pin_performance` last 14d, compute:
   - `winner_probability = sigmoid(0.25*ctr_z + 0.20*save_z + 0.15*click_z + 0.15*dwell_z + 0.10*atc_z + 0.10*gallery_z + 0.05*variant_z)` (z-score vs category benchmark from `pinterest_category_benchmarks`)
   - `revenue_probability = sigmoid(0.40*atc_rate + 0.30*purchase_rate + 0.20*checkout_rate + 0.10*click_z)` from `pinterest_pdp_conversion_stats`
   - `viral_probability = sigmoid(0.50*save_velocity + 0.30*impression_velocity + 0.20*ctr_z)` (velocity = today vs 7d avg)
   - Persist to new `pinterest_pin_predictions` (pin_id, computed_at, winner_p, revenue_p, viral_p, inputs jsonb).
3. **Auto-amplify** — for pins with `winner_p > 0.70` OR `revenue_p > 0.70`:
   - Pull current winner copy + image.
   - Call `pinterest-creative-director` with `count=10` (images), `seo_mode=true`, and (if `pinterest-video-queue` healthy) enqueue 5 video drafts.
   - Generate 5 title + 5 description variants via Lovable AI (`google/gemini-3-flash-preview`) seeded with top-3 trending keywords from `pinterest_trend_signals` for the product's niche; persist to `pinterest_title_variants` + `pinterest_creative_variants`.
   - Distribute drafts across all eligible non-generic production boards (board governance rules already enforce this).
4. **Product Discovery Engine** — daily catalog scan:
   - Query `products` where `is_active=true`, `margin_percent>=0.30`, has ≥3 images, has `image_url` matching WebP standards, `pin_count_30d<3`.
   - Score by `pdp_strength = scroll_depth_avg*0.4 + atc_rate*0.4 + dwell_avg/10000*0.2` from `pinterest_pdp_conversion_stats` (fallback to neutral 0.5 if no data).
   - Insert top 20 into `pinterest_product_tiers` with `hidden_opportunity=true`, `discovery_source='catalog_scan'`.
5. **Revenue Ranking** — refresh new view `pinterest_product_revenue_ranks` classifying every active product into one of 5 buckets using `pinterest_opportunity_ranks` + `pinterest_revenue_funnel_daily`:
   - `viral_winner` (viral_p≥0.7)
   - `revenue_winner` (revenue_p≥0.7 OR 30d revenue top 10%)
   - `emerging` (clicks_30d>5 AND winner_p∈[0.4,0.7])
   - `hidden_opportunity` (hidden_opportunity=true OR dwell>8s+pin_count<3)
   - `underperformer` (rank_tier='loser')
6. **Loser suppression** — already handled by `pinterest-growth-orchestrator` — brain only flags them in `pinterest_brain_runs.summary`.
7. **Log** to new `pinterest_brain_runs` + `pinterest_brain_actions`.

### 2. DB migration
- `pinterest_pin_predictions` (pin_id, computed_at, winner_p, revenue_p, viral_p, inputs jsonb, model_version).
- `pinterest_brain_runs` (started_at, finished_at, predictions_computed, winners_amplified, drafts_enqueued, products_discovered, errors, summary jsonb).
- `pinterest_brain_actions` (run_id, action_type, product_id, pin_id, payload jsonb).
- Add columns to `pinterest_product_tiers`: `discovery_source text`, `pdp_strength_score numeric`, `revenue_bucket text`.
- View `pinterest_product_revenue_ranks` (security-invoker).
- All tables: GRANT to authenticated (admin-read via `has_role`) + service_role-all + RLS.

### 3. Trends → copy generator
Extend `pinterest-creative-director`: when `seo_mode=true`, accept `trending_keywords[]` param (top 3 from `pinterest_trend_signals` for product niche, US-only). Inject into title pool ("[keyword] [product]"), description (1 sentence), and 3 hashtags from same pool. No new LLM call — uses existing prompt.

### 4. AI Executive Dashboard: `/admin/pinterest-brain`
New lazy-loaded page `PinterestBrainPage.tsx`. Single-screen executive view:
- **Forecast cards (30d):** expected visitors, expected revenue, expected ATC, expected purchases — pulled from `pinterest_forecasts` aggregate + brain projection (visitors × avg_conv × aov).
- **Bucket panels:** Viral Winners / Revenue Winners / Emerging / Hidden Opportunities / Underperformers — top 10 each with thumbnails + key metric.
- **Top 20 pins** by winner_p (table with thumbnail, CTR, saves, clicks, predictions).
- **Top 20 products** by revenue_bucket=revenue_winner sorted by 30d revenue.
- **Bottlenecks panel:** reads `monitoring_alerts` filtered to category `pinterest*`; plus brain-computed: warm-up cap hit, board exhaustion, low US share, OAuth stale.
- **AI recommendations:** static rules engine (no LLM call) — "scale category X", "pause product Y", "boost board Z".
- **Run log:** last 14 `pinterest_brain_runs`.
- "Run brain now" admin-only button.

Route registered in `src/App.tsx` lazy.

### 5. Nightly cron
`pg_cron` at `45 2 * * *` UTC (id new) → POST `pinterest-growth-brain` with `pg_net`. Inserted via `supabase--insert` after migration (anon key not committed).

### 6. Safety guarantees
- Per-run hard caps: max **120 drafts** enqueued (matches phase-2 cap), max 50 status flips.
- All copy/image dedupe via existing SHA-256 (90d window).
- Never DELETE pins, products, or queue rows. Only flip `status`/`priority`.
- Never bypass warm-up — publisher still owns cadence.
- Pinterest-compliant title (≤5 words) + overlay (≤6 words, ban list) rules from `pinterest-growth-engine` v2 stay authoritative.

## Out of scope
- No new image generation pipeline (reuses creative director).
- No live Pinterest Trends API call (gated; uses existing `pinterest_trend_signals` from US seasonal harvester).
- No publisher cadence change.
- No data deletion.

## Files
**New:**
- `supabase/migrations/<ts>_pinterest_growth_brain.sql`
- `supabase/functions/pinterest-growth-brain/index.ts`
- `src/pages/admin/PinterestBrainPage.tsx`

**Edited:**
- `src/App.tsx` — register `/admin/pinterest-brain` lazy.
- `supabase/functions/pinterest-creative-director/index.ts` — accept `trending_keywords[]` when `seo_mode=true`.

**Cron:** inserted via `supabase--insert` after migration.

## Verification
1. Migration applied → `pinterest_pin_predictions`, `pinterest_brain_runs`, `pinterest_brain_actions`, view exist.
2. `curl_edge_functions` POST brain with `{dry_run:true}` — expect prediction counts + bucket counts, zero writes.
3. Real run — confirm rows in all three tables + 5-bucket distribution on view.
4. Visit `/admin/pinterest-brain` — KPIs populate, bucket panels populate, run log shows manual run.

## Projections (after first 7 nights)
- Drafts/day: ~80–120 (winner amplifier 10img+5vid×top winners + discovery 20)
- Effective publishes/day: 25 (publisher warm-up cap is authoritative)
- Expected monthly Pinterest visitors at steady state: 4,000–6,500
- Days to 5,000 sessions/month: ~30–45 nights from baseline

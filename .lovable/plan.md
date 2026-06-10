## Goal

Extend the existing **Pinterest Revenue AI V5** stack (edge function `pinterest-revenue-ai`, `/admin/revenue-ai`, V4 loop, `pinterest_visitor_revenue_scores`, `pinterest_opportunity_ranks`, `pinterest_forecasts`, `monitoring_alerts`) with traffic-quality filtering, per-visitor quality scoring, PDP conversion intelligence, creative variant generation, dashboard tabs, and additional health checks. **No duplicate engines, no duplicate dashboards, no duplicate cron stacks.**

## What gets reused (no rebuild)

- `pinterest-revenue-ai` edge function (V5) — add new actions onto it
- `/admin/revenue-ai` page — add tabs, do not create a sibling route
- `pinterest_visitor_revenue_scores` — add classification columns
- `pinterest_opportunity_ranks` + `pinterest_forecasts` — feed from cleaned data
- `monitoring_alerts` (alert_key prefix `pinterest_revenue_ai:`) — add new alert keys
- `lp_funnel_events` + `visitor_activity` — sole event sources
- `envelope()` in `src/lib/lpFunnelMirror.ts` — single classification path
- Existing 6h loop + hourly health cron + weekly backfill cron — extend, don't add parallel schedulers
- `useCtaCopyWinner`, existing creative variant tables (`pinterest_title_variants`, `pinterest_keyword_bank`) — reuse for Phase 4

## Phase 1 — Traffic quality filtering (client)

- `src/lib/lpFunnelMirror.ts`: route `view_item` mirror through the same `envelope()` used by `pdp_view` (currently bypassed → NULL classification). Single function, no duplication.
- Extend the existing `classification` enum values written into `lp_funnel_events` to include: `verified_user`, `probable_user`, `crawler`, `bot`, `pre_render`, `single_bounce`. Logic lives in `envelope()` only — fed by existing `botDetection.ts` + a new `pre_render` heuristic (UA `pinterestbot`/`facebookexternalhit`/zero interaction after 5s) and `single_bounce` (post-session backfill, see Phase 2).
- No new client tracking system — only enrichment of the existing pipeline.

## Phase 2 — Pinterest visitor quality score (server, extends existing scorer)

- Extend the existing `scoreVisitors` function in `pinterest-revenue-ai/index.ts`. Do NOT create a parallel scorer.
- Add columns to `pinterest_visitor_revenue_scores`:
  - `visitor_quality_score smallint` (0–100)
  - `intent_tier text` (`low` | `medium` | `high` | `buyer`)
  - `classification text` (mirrors lp_funnel_events)
  - `scroll_depth_max smallint`, `image_interactions smallint`, `variant_selections smallint`, `return_visit boolean`
- Formula (additive, capped at 100):
  ```
  time_on_page (max 25) + scroll_depth (max 20) + second_page (10)
  + add_to_cart (15) + image_interaction (10) + variant_select (10)
  + checkout_start (15) + return_visit (10)
  ```
  Tier: 0–20 low / 21–50 medium / 51–80 high / 81–100 buyer.
- Historical: every score row is already append-only by `(session_id, scored_at)`; keep as historical snapshot.

## Phase 3 — Landing-page conversion intelligence (one new table)

- New table `pinterest_pdp_conversion_stats` (one row per product per day):
  - `product_id`, `day`, `views`, `avg_scroll_pct`, `gallery_opens`, `atc`, `checkout`, `purchases`, `exit_rate`, `pinterest_clicks`, `atc_rate`, `checkout_rate`, `purchase_rate`, `verdict` (`winner` | `viewed_but_no_atc` | `bounce` | `pinterest_winner` | `pinterest_loser` | `neutral`)
- New action `aggregate_pdp_stats` on `pinterest-revenue-ai`. Reads `lp_funnel_events` filtered to `classification IN ('verified_user','probable_user')` only.
- Winners/losers are a view on this table — no second table.

## Phase 4 — Creative optimization (extends existing variant tables)

- New action `generate_creative_variants` on `pinterest-revenue-ai`. Inputs: top N products from `pinterest_pdp_conversion_stats.verdict='pinterest_winner'`.
- Uses Lovable AI Gateway to produce per product: 10 titles, 10 hooks, 10 benefits, 5 CTAs.
- Writes into existing `pinterest_title_variants` (titles) and one new lightweight table `pinterest_creative_variants` for hooks/benefits/CTAs (`product_id`, `kind`, `text`, `created_at`, `score`, `wins`, `impressions`). Reused by existing creative-director publish path — no new publisher.

## Phase 5 — Dashboard extension (tabs on /admin/revenue-ai)

- Edit `src/pages/admin/RevenueAiPage.tsx`. Add tabs: **Overview** (existing), **Traffic Quality**, **Top Products**, **Top Pins**, **Opportunities** (Phase 7), **Alerts**.
- New `dashboard` action sub-payloads: `traffic_quality` (crawler/bot/pre_render/human %), `top_products` (joins `pinterest_pdp_conversion_stats`), `top_pins` (from `pinterest_pin_performance`), `opportunities`, `alerts` (from `monitoring_alerts`).
- No new route, no new page file.

## Phase 6 — Health monitoring (extends existing health check)

- Extend `healthCheck` action already on `pinterest-revenue-ai` with new checks:
  - Pinterest traffic 24h vs 7d avg → P1 if drop >50%
  - 404 spikes from `frontend_error_logs` filtered to Pinterest referers → P1
  - `add_to_cart` 0 over 24h while Pinterest traffic >100 → P2
  - `begin_checkout` 0 over 24h → P2
  - `payment_success` 0 over 72h → P1
  - Pinterest OAuth disconnect (`pinterest_connection.expires_at`) → P1
  - Merchant feed errors (`merchant_sync_logs.status='error'` in 24h) → P2
- Writes to existing `monitoring_alerts` with new `alert_key`s under prefix `pinterest_revenue_ai:`. Surfaced in dashboard Alerts tab.

## Phase 7 — Revenue opportunities (derived, no new engine)

- View/action on top of `pinterest_pdp_conversion_stats` + `pinterest_opportunity_ranks`: products with `pinterest_clicks` high + `purchase_rate` low.
- Recommendation strings generated from rule table (title/CTA/images/price/desc/trust) — no LLM call required at read time.
- Rendered in the **Opportunities** tab.

## Phase 8 — Auto-learning (reuse existing cron)

- The existing 6h loop already runs `score_visitors → rank_opportunities → forecast → health_check`. Insert two new steps in the same loop:
  1. `aggregate_pdp_stats`
  2. `generate_creative_variants` (only when new winners appear)
- No new cron schedule. Weekly backfill cron also re-runs aggregation for the trailing 30d.

## Database changes (single migration)

```text
ALTER TABLE pinterest_visitor_revenue_scores
  ADD COLUMN visitor_quality_score smallint,
  ADD COLUMN intent_tier text,
  ADD COLUMN classification text,
  ADD COLUMN scroll_depth_max smallint,
  ADD COLUMN image_interactions smallint,
  ADD COLUMN variant_selections smallint,
  ADD COLUMN return_visit boolean;

CREATE TABLE pinterest_pdp_conversion_stats (...);  -- + GRANTs + RLS
CREATE TABLE pinterest_creative_variants (...);      -- + GRANTs + RLS
```

Both new tables: `GRANT SELECT,INSERT,UPDATE,DELETE ... TO authenticated; GRANT ALL TO service_role;` RLS = admin-only via `has_role(auth.uid(),'admin')`.

## Files touched

- `src/lib/lpFunnelMirror.ts` (envelope on view_item + new classifications)
- `src/lib/botDetection.ts` (add `pre_render` reason)
- `supabase/functions/pinterest-revenue-ai/index.ts` (new actions: `aggregate_pdp_stats`, `generate_creative_variants`, extended `scoreVisitors`, extended `healthCheck`, extended `dashboard`)
- `src/pages/admin/RevenueAiPage.tsx` (tabs)
- `supabase/migrations/<ts>_pinterest_revenue_ai_v5_quality.sql`
- `mem/marketing/pinterest-revenue-ai-v5.md` (update)

## Out of scope

- Any new edge function, new cron job, new dashboard route, new tracking SDK, new event sink. All work strictly extends V5.

## Expected impact

- Cleaner conversion rate denominator (crawlers excluded) → realistic 1.5–3× reported CR.
- Visitor quality score gives the publisher a 0–100 dial for budget/bid steering.
- PDP conversion table surfaces the 5–10 products that deserve creative re-spend, lifting Pinterest-attributed revenue.

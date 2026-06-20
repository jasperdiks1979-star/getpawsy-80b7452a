
# Autonomous Revenue AI V1

A revenue-first learning layer that sits on top of Pinterest Revenue AI V5, Gold Standard, Self-Healing Pipeline, and the Inventory Engine. It does NOT replace any of them — it changes WHAT they prioritize: outbound clicks, ATC, checkouts, purchases, and revenue (not impressions/views).

## 1. Data model (single migration)

New tables (admin read, service write, full GRANT + RLS):

- `revenue_ai_pin_performance` — per pin daily rollup: pin_id, product_id, voice_id, category, hook_archetype, cta_archetype, video_duration_bucket, opening_scene_archetype, camera_archetype, impressions, outbound_clicks, saves, atc, checkouts, purchases, revenue_cents, outbound_ctr, atc_rate, checkout_rate, purchase_rate, revenue_per_impression, revenue_per_click, percentile_revenue (0-100), tier (`top_1|top_5|top_10|mid|loser|untested`), day. Source: joins `pinterest_pin_performance`, `pinterest_visitor_revenue_scores`, `lp_funnel_events`, GA4 events.
- `revenue_ai_winner_dna` — distilled DNA from top performers per dimension (voice, hook, cta, category, duration, opening, camera, style). dimension, key, n_pins, avg_revenue_per_click, avg_purchase_rate, score, ewma, last_seen.
- `revenue_ai_loser_blocklist` — pin/creative-pattern blocks: scope (`pin|hook|voice|template|category_style`), key, reason, evidence_pins[], blocked_until, severity.
- `revenue_ai_voice_rankings` — voice_id, n_pins, outbound_clicks, purchases, revenue_cents, revenue_per_click, conversion_rate, ranking (1..N), allocation_weight (0..1), updated_at.
- `revenue_ai_category_profiles` — category, winning_hook_archetypes[], winning_cta[], winning_duration_bucket, winning_voice_ids[], winning_camera, avg_revenue_per_click, sample_size, last_refreshed.
- `revenue_ai_trend_signals` — date, category, trend_score (Pinterest external + internal), pct_change_7d, direction (`rising|stable|falling`), recommended_quota_multiplier.
- `revenue_ai_revenue_scores` — product_id, stock_score, ctr_score, sales_score, media_score, pinterest_score, composite (0-100), tier (`hero|winner|contender|tail`), publish_multiplier (0.25–3.0), reason, updated_at.
- `revenue_ai_executive_reports` — date, kpis jsonb (pins, clicks, atc, checkouts, purchases, revenue), top_products jsonb, worst_products jsonb, rising_categories jsonb, falling_categories jsonb, promote_more jsonb, promote_less jsonb, headline_text, full_markdown, sent_at.
- `revenue_ai_settings` (singleton) — `top1_pct=0.01`, `top5_pct=0.05`, `top10_pct=0.10`, `loser_min_impressions=2000`, `loser_ctr_floor_ratio=0.6` (vs account avg), `voice_min_pins=10`, `winner_clone_max_per_day=30`, `loser_block_days=14`, `queue_min_video_jobs=100`, `queue_min_pins=50`, `queue_min_reserve=20`, `executive_hour_utc=5`, `revenue_weight_split jsonb` (clicks/atc/checkout/purchase weights = 1/3/6/12).

## 2. Shared module

`supabase/functions/_shared/revenue-ai.ts`
- `computeRevenueScore(product)` — weighted: stock 15, ctr 15, sales 30, media 15, pinterest 25.
- `bucketDuration(seconds)` — `<6|6-10|10-15|15-25|25+`.
- `archetypeFromText(hook|cta)` — keyword/regex classifier (no AI call per row).
- `scoreVoice(stats)` — `revenuePerClick * 0.6 + purchaseRate * 0.4`.
- `tierFromPercentile(p)` — top_1/top_5/top_10/mid/loser/untested.
- `pickWinnerForClone(dna)` — weighted-random across top DNA respecting category diversity governor.
- `nextAllocationWeight(rank, n)` — soft-max-ish: top 20% → 2x base, bottom 20% → 0.25x base.

All gateway/HTTP calls go through existing `pinterest-credit-guard.aiGatewayFetch`.

## 3. Edge functions

1. `revenue-ai-perf-rollup` (cron every 30 min)
   - Builds today's `revenue_ai_pin_performance` rows from `pinterest_pin_performance` + `pinterest_visitor_revenue_scores` + `lp_funnel_events` + GA4 mirror. Computes percentile_revenue per category-day, assigns tier.

2. `revenue-ai-winner-detect` (cron hourly)
   - For each dimension (voice/hook/cta/category/duration/opening/camera/style) aggregates trailing 30d revenue across top_1/5/10. Upserts `revenue_ai_winner_dna` with EWMA score (alpha 0.3). Marks losers below `loser_ctr_floor_ratio * account_avg_ctr` with `impressions >= loser_min_impressions` AND zero purchases.

3. `revenue-ai-winner-clone`
   - Picks N top DNA rows, fuses them into a creative brief (hook+voice+cta+duration+camera+category), respects Category Diversity Governor and Gold Standard, then enqueues into `cinematic_ad_jobs` via existing producer. Caps at `winner_clone_max_per_day`. Never exact-copies (varies at least 2 of: product/voice/text/cta).

4. `revenue-ai-loser-suppress` (cron hourly)
   - Promotes loser pins/patterns into `revenue_ai_loser_blocklist`, calls `pinterest-loser-blocklist` for SKUs, and tells the producer to skip those `(category, style, hook)` triples for `loser_block_days`.

5. `revenue-ai-voice-allocator` (cron daily 03:00 UTC)
   - Recomputes `revenue_ai_voice_rankings`. Writes `allocation_weight` per voice. `pinterest-video-publisher`/voice picker reads these weights when choosing voice.

6. `revenue-ai-category-profile` (cron daily 03:15 UTC)
   - Builds `revenue_ai_category_profiles` from top 10% pins per category over trailing 30d.

7. `revenue-ai-trend-detect` (cron daily 03:30 UTC)
   - Combines Pinterest trend signals (existing `pinterest_trend_signals`) with our own 7d delta of revenue per category. Writes `revenue_ai_trend_signals` with `recommended_quota_multiplier` (rising 1.5x, falling 0.5x). Pipeline replenish reads this to bias product picks.

8. `revenue-ai-revenue-score` (cron every 2h)
   - Recomputes `revenue_ai_revenue_scores` for all in-stock products. Publish multiplier feeds `pipeline-auto-replenish` ordering.

9. `revenue-ai-queue-guard` (cron every 5 min)
   - Counts pending video jobs / publishable pins / reserve. If below thresholds, invokes `pipeline-auto-replenish` with revenue-score-weighted product list.

10. `revenue-ai-failover` (called by publisher/render workers via shared helper, not cron)
    - 4-tier fallback: AI render → product video → cinematic slideshow (existing) → backup voice provider (existing TTS swap) → requeue on Pinterest API 5xx. Logs to `pinterest_pipeline_failures` with `source`.

11. `revenue-ai-product-eliminator` (cron daily 04:00 UTC)
    - Removes from promotion: `effective_stock<=0`, 404 PDP, `product_media_audit.failed`, conversion_rate=0 with ≥500 clicks, avg rating <3.5 with ≥5 reviews. Updates `revenue_ai_revenue_scores.tier='tail'` and writes loser blocklist entries.

12. `revenue-ai-executive-report` (cron daily 05:00 UTC)
    - Builds 24h+7d KPIs, top/worst products, rising/falling categories, "promote more/less" lists. Renders markdown via Lovable AI (gemini-3-flash) summarizer for headline_text. Stores in `revenue_ai_executive_reports`, fires `monitoring_alerts` with severity P3 link.

13. `revenue-ai-dashboard` (admin GET)
    - Returns: composite KPIs, top converting pins, top/worst products, voice rankings, category rankings, Pinterest revenue, GA4 revenue, estimated monthly revenue (trailing 30d × 30 trend factor), latest executive report.

## 4. Wiring into existing functions (minimal, additive)

- `pipeline-auto-replenish`: ORDER BY uses `revenue_ai_revenue_scores.composite DESC` then `revenue_ai_trend_signals.recommended_quota_multiplier` as tiebreaker (falls back to current order if missing).
- `pinterest-video-publisher`: voice picker consults `revenue_ai_voice_rankings.allocation_weight`.
- `cinematic-ad-autopublish`: before queueing, checks `revenue_ai_loser_blocklist` for `(category, style, hook)` triple.
- `pinterest-pin-creator`: hook/cta archetype tag written into `pinterest_pin_queue.meta` for rollup join.
- `pinterest-eligibility`: no change — already enforces stock/404/media.

## 5. Crons (pg_cron via supabase--insert)

| job | schedule |
|---|---|
| `revenue-ai-perf-rollup` | `*/30 * * * *` |
| `revenue-ai-winner-detect` | `7 * * * *` |
| `revenue-ai-loser-suppress` | `12 * * * *` |
| `revenue-ai-revenue-score` | `25 */2 * * *` |
| `revenue-ai-queue-guard` | `*/5 * * * *` |
| `revenue-ai-voice-allocator` | `0 3 * * *` |
| `revenue-ai-category-profile` | `15 3 * * *` |
| `revenue-ai-trend-detect` | `30 3 * * *` |
| `revenue-ai-product-eliminator` | `0 4 * * *` |
| `revenue-ai-executive-report` | `0 5 * * *` |

Winner-clone runs on-demand from the dashboard and is also kicked by `revenue-ai-winner-detect` when fresh winners appear.

## 6. Admin UI

`/admin/revenue-ai` (existing page) gets a new top section:

- `RevenueAiCommandPanel.tsx` — composite revenue score gauge, today's KPIs (clicks, ATC, checkouts, purchases, revenue, est. monthly), trailing 7d sparkline.
- `RevenueAiWinnersPanel.tsx` — top converting pins (with DNA badges), top converting products.
- `RevenueAiLosersPanel.tsx` — worst performing products + blocked patterns.
- `RevenueAiVoiceRankingsPanel.tsx`, `RevenueAiCategoryRankingsPanel.tsx`, `RevenueAiTrendsPanel.tsx`.
- `RevenueAiExecutiveReportPanel.tsx` — latest nightly report with "Send to Slack/SMS" using existing `revenue-alert-monitor`.
- Buttons: Run perf rollup, Run winner detect, Run clone, Run executive report.

## 7. Quality & safety

- All cloned creatives must pass Gold Standard ≥ 80 (no bypass).
- Loser suppression honors Category Diversity Governor min floors.
- Inventory eliminator uses `effective_stock` (global warehouse engine), never single-warehouse.
- Revenue scoring tolerates missing GA4: falls back to `pinterest_visitor_revenue_scores`.
- All edge functions wrap calls with existing failure recorder → `pinterest_pipeline_failures` so Self-Healing picks them up.

## 8. Out of scope

- New AI providers, credit top-ups (credit guard handles).
- New warehouses/sources (Inventory V1 handles).
- New Pinterest creative formats (Gold Standard + V4/V5 handle).

## 9. Files

**Created** (1 migration + 1 shared + 13 edge functions + 7 components + 1 cron-insert):

- `supabase/migrations/<ts>_autonomous_revenue_ai_v1.sql`
- `supabase/functions/_shared/revenue-ai.ts`
- 13 edge functions under `supabase/functions/revenue-ai-*`
- `src/components/admin/revenue-ai/*` (7 panels)

**Edited**:
- `supabase/functions/pipeline-auto-replenish/index.ts`
- `supabase/functions/pinterest-video-publisher/index.ts`
- `supabase/functions/cinematic-ad-autopublish/index.ts`
- `supabase/functions/pinterest-pin-creator/index.ts`
- `src/pages/admin/RevenueAiPage.tsx` (mount new panels)
- `mem/marketing/pinterest-revenue-ai-v5.md` (append V1 autonomous layer note)
- `.lovable/plan.md`

Proceed on approval — direct productie, geen demo, geen mock data.

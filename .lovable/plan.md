# Pinterest AI Analytics & Optimization Engine

A self-learning growth system that ingests Pinterest performance + GA4 + order data, scores winners/losers per category and creative axis, and feeds the publisher with trend-aware, attribution-backed decisions.

## Scope & sequencing

This is a large build. I'll deliver in **4 phases**, each independently shippable. After each phase you can pause, inspect, or redirect. Estimated 8–12 migrations + 10 edge functions + 1 admin route with 6 panels.

```text
Phase 1  Data layer + metrics ingestion
Phase 2  Winner/loser engine + auto-cloning
Phase 3  Trends, competitor intel, dynamic scheduling
Phase 4  Executive dashboard + attribution + safety
```

## Phase 1 — Data foundation

**New tables (all admin-RLS):**
- `pinterest_analytics_daily` — `(pin_id, day, impressions, outbound_clicks, saves, pin_clicks, video_views, ctr, engagement_rate, quality_score)` — daily snapshots from Pinterest Analytics API.
- `pinterest_pin_dimensions` — denormalized lookup `(pin_id, asset_id, product_slug, category_key, hook_variant, copy_variant, cta_variant, niche_key, board_id, published_at)` — single join target for all analytics queries.
- `pinterest_category_benchmarks` — rolling 14d/30d averages per `category_key` (CTR, save rate, engagement) used as thresholds.
- `pinterest_pin_verdicts` — `(pin_id, verdict 'winner'|'loser'|'neutral', reason, scored_at, action_taken)` — append-only audit of every classification.

**New edge functions:**
- `pinterest-analytics-sync` — pulls `/v5/pin_analytics` for last 7 days, upserts `pinterest_analytics_daily`, refreshes `pinterest_pin_dimensions` from `pinterest_video_queue` + `pinterest_pin_queue`.
- `pinterest-benchmarks-rollup` — refreshes `pinterest_category_benchmarks` (14d window, min 30 pins per category).

**Cron:** analytics-sync hourly, benchmarks-rollup every 6h.

## Phase 2 — Self-learning winner/loser engine

**New edge functions:**
- `pinterest-winner-detector` — for each pin with impressions ≥1000: compare CTR vs category benchmark, saves vs threshold. Writes verdict to `pinterest_pin_verdicts`. On `winner`: enqueue 3 variant drafts via existing `pinterest-video-clone-top-performers` + raises `priority` on `pinterest_video_queue`. On `loser`: sets `archived=true`, blocks future cloning (`pinterest_loser_blocklist`).
- Extend `pinterest_video_queue` with `priority int default 50`, `archived bool default false`, `winner_score numeric`.
- Update existing `pinterest-video-publisher` to ORDER BY `priority desc, created_at asc` and skip `archived=true`.

**Cron:** winner-detector every 2h.

## Phase 3 — Trends + competitor intel + dynamic scheduling

**New tables:**
- `pinterest_trend_signals` — `(keyword, source 'pinterest_trends'|'seasonal'|'viral', strength, valid_from, valid_to, category_key)`.
- `pinterest_competitor_pins` — periodic scrape sample: `(pin_external_id, title, description, save_rate_est, visual_hash, pattern_tags[])` used as inspiration tokens for the creative director.
- `pinterest_posting_windows` — per `(category_key, timezone)` best hours rolled up from `pinterest_analytics_daily` engagement by hour-of-day.

**New edge functions:**
- `pinterest-trend-harvester` — fetches Pinterest Trends API (where available) + a curated US holiday calendar + seasonal pet topics (summer cooling, winter coats, etc.). Writes to `pinterest_trend_signals`.
- `pinterest-competitor-scan` — uses existing Firecrawl/websearch + a vetted list of top US pet pinners; classifies hooks/CTAs with `google/gemini-3-flash-preview`.
- `pinterest-schedule-optimizer` — rolls up engagement by hour × timezone, populates `pinterest_posting_windows`. The publisher then dequeues only when current time falls inside a top window for the pin's target timezone.

**Cron:** trend-harvester daily 04:00, competitor-scan daily 05:00, schedule-optimizer daily 06:00.

## Phase 4 — Attribution, executive dashboard, safety

**Attribution (extends existing `pinterest_attribution_sessions` + `pinterest_capi_outbox`):**
- New view `pinterest_revenue_attribution` joining `pinterest_attribution_sessions` → `orders` on `session_key` → first-touch pin → revenue. Stored as a security-definer function for admin-only reads.
- New table `pinterest_funnel_events` capturing view/atc/checkout/purchase per pin_id for funnel math.

**Safety systems:**
- `pinterest_publish_governor` — single-row config: `max_pins_per_hour`, `max_per_board_per_day`, `cooldown_minutes_per_product`, `trust_score`.
- Publisher pre-flight check enforces these + dedups by visual hash (already in `pinterest-queue-visual-duplicate-guard` memory).
- `pinterest-domain-health-check` cron pings `https://getpawsy.pet` + Pinterest pin sample; writes trust_score 0–100.

**Executive dashboard — `/admin/pinterest-intelligence`:**
Lazy-loaded route, 6 panels:
1. **Headline KPIs** — impressions, outbound clicks, saves, CTR, est. revenue (last 7d vs prior 7d).
2. **Category leaderboard** — cat litter / catio / dog bed / pet tech / toys: CTR, saves, revenue, ROAS estimate.
3. **Hook × Copy × CTA matrix** — heatmap of variants by CTR.
4. **Winners & losers feed** — latest verdicts with one-click "republish 3 variants" or "archive permanently".
5. **Best publishing windows** — heatmap hour × timezone.
6. **Trend radar + competitor patterns** — signals expiring soon, dominant competitor hook archetypes.

All panels query views/RPCs; no client-side joins of >1k rows.

## Cron schedule plan

```text
hourly        pinterest-analytics-sync
every  2h     pinterest-winner-detector
every  6h     pinterest-benchmarks-rollup
daily 04:00   pinterest-trend-harvester
daily 05:00   pinterest-competitor-scan
daily 06:00   pinterest-schedule-optimizer
daily 06:30   pinterest-domain-health-check
```

## Affected/new files (high level)

**New migrations** (~6, one per phase + indexes/views).
**New edge functions** (8): analytics-sync, benchmarks-rollup, winner-detector, trend-harvester, competitor-scan, schedule-optimizer, domain-health-check, intelligence-api.
**Edited:** `pinterest-video-publisher` (priority + window gating + governor), `pinterest-video-clone-top-performers` (uses verdicts table), `supabase/config.toml`.
**New admin UI:** `src/pages/admin/PinterestIntelligence.tsx` + 6 panel components under `src/components/admin/pinterest-intel/`, route registered in `src/App.tsx`.

## Migration plan

1. Phase 1 migration → deploy 2 functions → schedule crons → wait one cycle, verify data flowing.
2. Phase 2 migration → deploy detector → manually run once on backfill → review verdicts before enabling auto-clone.
3. Phase 3 migration → deploy 3 functions + crons.
4. Phase 4 migration + dashboard ships last (read-only on already-populated tables).

## Future scaling recommendations

- Move `pinterest_analytics_daily` to monthly partitions once >1M rows.
- Swap the Gemini classifier for a fine-tuned embedding model once we have >10k labeled pins.
- Add a Pinterest Ads bridge so the same winner signal drives paid amplification automatically (requires Pinterest Ads API key — out of scope here).
- Cross-channel: feed the same winner verdicts into TikTok queue scoring for unified creative DNA.

## What I need from you before building

This is ~2–3 hours of build time across migrations, functions, and UI. Two quick decisions:

1. **Start with all 4 phases**, or ship Phase 1+2 first and review before Phase 3+4?
2. **Pinterest Trends API:** the official endpoint is gated. OK to fall back to a curated seasonal calendar + competitor-derived trending terms if the API isn't accessible?
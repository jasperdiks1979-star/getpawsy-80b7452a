
# GetPawsy Autonomous Growth Intelligence — Build Plan

This is a large, multi-system build. I'll ship it in 6 phases, each independently deployable and reversible. Existing pipelines (cinematic ads watchdog, Pinterest creative director, autopilot scheduler, video publisher) stay intact — this layer sits on top and feeds them.

## Architecture overview

```text
 ┌─────────────────────────────────────────────────────────────────┐
 │  Market Intelligence (trends, competitors, keywords, hooks)     │
 └───────────────┬─────────────────────────────────────────────────┘
                 ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │  Product Opportunity Scoring  (daily score per product)         │
 └───────────────┬─────────────────────────────────────────────────┘
                 ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │  Daily Decision Engine  → picks 4–5 products + angles           │
 └───────────────┬─────────────────────────────────────────────────┘
                 ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │  Creative Strategy + Variant Generator (hooks, copy, scenes)    │
 └───────────────┬─────────────────────────────────────────────────┘
                 ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │  Video / Pin Production  (reuses cinematic + creative director) │
 └───────────────┬─────────────────────────────────────────────────┘
                 ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │  Pinterest Autopilot Publisher (reuses existing scheduler)      │
 └───────────────┬─────────────────────────────────────────────────┘
                 ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │  Performance Tracking + Learning Loop → updates scores          │
 └─────────────────────────────────────────────────────────────────┘
```

All decisions are written to `growth_decisions` for full auditability. All controls live in one new admin page: **Growth Intelligence Console**.

## Phase 1 — Scoring + Daily Product Selection (ship first)

**New tables (additive only):**
- `growth_market_trends` — term, source, market=US, score, momentum, season, captured_at
- `growth_keyword_opportunities` — keyword, volume, intent, fit_category, score
- `growth_viral_hook_patterns` — hook, family, structure, performance_score
- `growth_competitor_insights` — domain, pattern_type, summary, observed_at
- `growth_seasonal_opportunities` — period, theme, categories, lift_score
- `growth_product_scores` — product_id, day, opportunity_score, reasons jsonb, recommended_channel, recommended_angle, recommended_hook, confidence
- `growth_decisions` — day, decision_type, product_id, payload jsonb, reason, status
- `growth_autopilot_config` (singleton) — enabled, paused_publishing, max_pins_per_day, min_product_score, category_whitelist, mode (manual/auto), emergency_stop
- `growth_strategy_scores` — dimension (hook/angle/style/time/board/keyword/category), key, score, samples, updated_at
- `growth_weekly_reports` — week_start, payload jsonb

**Edge functions:**
- `growth-score-products` — runs daily, scores all active US products (image quality, price, demand, Pinterest/TikTok fit, prior performance, availability, page quality) → writes `growth_product_scores`
- `growth-select-daily` — picks 4–5 products honoring rules (no OOS, no 7-day repeat, mix of safe winners + experiments, respects `min_product_score` and category filters) → writes `growth_decisions`

**Admin UI:** `/admin/growth-intelligence` page with: today's selected products, opportunity scores w/ reasons, "Run scoring now", "Re-select today", autopilot ON/OFF + mode controls.

**Cron:** daily 06:00 UTC scoring → 06:15 UTC selection.

## Phase 2 — Creative Strategy + Variant Generator

- `growth-creative-strategy` edge function: for each selected product, call Lovable AI (gemini-2.5-flash) with strict JSON schema to produce {hook×3, voiceover, scene_plan, captions, pin_title×2, pin_description×2, hashtags, CTA×2, audience_angle, pain_point, benefit_stack, emotional_trigger, visual_styles×2}
- Stored in `growth_creative_variants` (product_id, decision_id, variants jsonb, status)
- Controlled rotation: variant_selector picks one combo per scheduled slot, marks others queued
- Pre-flight safety: merchant-policy banned terms scrub (reuses `src/config/merchant-policy.ts` patterns)

## Phase 3 — Video Production + Pinterest Autopilot Scheduling

- `growth-produce-video` dispatches existing cinematic ad render with selected variant + product → existing watchdog handles failures
- On render success, inserts into `pinterest_pin_queue` (draft) via existing `pinterest-creative-director` contract (draft-only, no `backdrop_*` fields per memory)
- `growth-schedule-pins` populates `pinterest_autopilot_schedule` rows across 4 US prime windows (8–10/12–2/5–7/8–10 ET), randomized, respecting max-per-day and 1-pin-per-product-per-week
- Pre-publish guardrails (gate inside scheduler): stock check, URL check, video metadata check, dup-title 14d check, token freshness

## Phase 4 — Performance Tracking

- `growth-perf-snapshot` daily edge function: pulls Pinterest analytics (reuses existing pinterest video/metrics sync where applicable) + GA4-style internal metrics from `visitor_activity` → writes `growth_performance_snapshots` (pin_id, product_id, day, impressions, saves, outbound_clicks, ctr, watch_time, sessions, atc, checkout, purchases, revenue)
- Attribution: joins on UTM `utm_source=pinterest&utm_campaign=growth_<decision_id>`

## Phase 5 — Learning Loop + Dashboard

- `growth-learning-loop` daily: aggregates last 14/30d performance per dimension → updates `growth_strategy_scores` with EWMA → feeds back into Phase 1 scorer and Phase 2 variant selector
- Dashboard expands: winners/losers, hook leaderboard, best times, best boards, current AI confidence, manual approval queue, emergency stop button, autopilot health (reuses existing `AutopilotHealthPanel`)

## Phase 6 — Self-Healing Integration + Weekly Reports

- Wire growth decisions into existing `cinematic-ad-watchdog`: on `needs_admin_review` for a growth-originated job, mark the `growth_decisions` row as `blocked`, surface in dashboard with AI-suggested next action
- `growth-weekly-report` Sunday 23:00 UTC → writes `growth_weekly_reports` row + sends admin email via existing `cinematic-ad-alert` template fork

## Safety / Compliance (applies all phases)

- No publish if: OOS, broken URL, missing image, video validation fails, Pinterest token missing/expired, GitHub billing blocked, non-pet category, title/category mismatch
- All edge functions: standard `{ok, traceId, message}` contract, append-only event log to `growth_events`
- All AI prompts forbid: vet-approved, eco-friendly, dropshipping terms, price anchoring, fake reviews (per project memory)
- US-only product filter throughout

## Files to create / modify (Phase 1 only — kept tight)

**New:**
- `supabase/migrations/<ts>_growth_intelligence_phase1.sql`
- `supabase/functions/growth-score-products/index.ts`
- `supabase/functions/growth-select-daily/index.ts`
- `src/pages/admin/GrowthIntelligenceConsolePage.tsx`
- `src/components/admin/growth-intelligence/DailySelectionPanel.tsx`
- `src/components/admin/growth-intelligence/AutopilotControls.tsx`

**Modified:**
- `src/App.tsx` (route)
- Admin nav

Phases 2–6 each add ~2–4 edge functions, 1–3 tables, and 1 dashboard section. No existing tables are modified; no existing functions are broken.

## Confirmation before I start

Shipping all 6 phases in one go is a lot of code and review surface. Two options:

1. **Phase 1 now, then iterate** — I build scoring + daily selection + console scaffold + autopilot controls, you verify scores look right on your real catalog, then I proceed phase-by-phase.
2. **All phases sequentially without pausing** — I build straight through; higher risk of misaligned assumptions on creative format or attribution.

I recommend **option 1**. Reply "go phase 1" (or "go all phases") and I'll start.

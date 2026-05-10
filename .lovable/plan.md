# Pinterest Commerce Intelligence Engine — Unified Build Plan

This extends the EXISTING `pinterest-creative-director`, `pinterest-viral-batch`, queue, publish, pattern, and analytics systems. No parallel engine. One pipeline, more intelligence layers.

Phase 1 of an earlier roadmap (dynamic landings + congruency tables) is already shipped; this plan builds on top of it, not next to it.

---

## Phase 1 — Visual Intelligence Engine (extend creative-director)
- Extend `_shared/pinterest-style-dna.ts` `detectNiche()` with a richer classifier that also outputs: `commerce_archetype` (impulse / problem-solver / luxury / cozy / gadget / health), `emotional_intent`, `visual_strategy`, `pin_mode` (see Phase 2).
- New `_shared/pinterest-visual-intelligence.ts`: pure functions taking a product → `{niche, archetype, hook_category, pin_mode, aesthetic, layout, cta_style, backdrop_direction}`.
- `pinterest-creative-director` calls this BEFORE `pickStrategy` and stamps results into `product_creative_profiles` and `pinterest_creative_intents`.

## Phase 2 — Pinterest Aesthetic System
- Add `PIN_MODES` registry in `_shared/pinterest-pin-modes.ts` with the 10 modes (Cozy Lifestyle, Before/After, Emotional Pain, Transformation, Social Proof, Luxury Minimal, Viral Curiosity, UGC Style, Moodboard Collage, Product+Lifestyle Blend). Each mode = composition rules + palette + typography hints + CTA tone + safe-area config.
- Style DNA × Pin Mode → final scene brief (no brand cloning, only abstract pattern features).

## Phase 3 — Collage Engine
- New `_shared/pinterest-collage.ts`: declarative layouts (split, 2x2, 3-stack, before/after, moodboard 4–6, multi-angle). Renders via `gemini-3-pro-image-preview` with structured composition prompts; falls back to compositing on a 1000×1500 canvas via Sharp-equivalent (Deno `imagescript`) when AI cannot meet safe-areas.
- Auto typography placement using safe-area zones already defined in queue-types.
- Soft shadows, Pinterest margins (top/bottom 8% safe, CTA above 78% line).

## Phase 4 — Mobile Safety + Quality AI
- Extend `_shared/pinterest-quality.ts` from current 5 axes to 8 (already partially proposed): add `mobile_safety_score`, `save_probability_score`, `click_probability_score`, `commerce_probability_score`, `emotional_score`. Keep weighted total + threshold (raise to 80).
- Reject reasons fed into retry loop (already wired). Cap MAX_RETRIES=2.
- Persist all 8 scores in `pinterest_pin_queue.meta.intelligence.scores` and `pinterest_render_attempts`.

## Phase 5 — Auto-Learning Feedback Loop
- New table `pinterest_performance_signals` (admin RLS) keyed by `(pin_id, hook, pin_mode, collage_type, board, niche, cta, backdrop_style, product_category)` storing: impressions, saves, outbound, session_seconds, atc, checkout, purchase, revenue, sample_size, last_updated.
- New cron-driven edge function `pinterest-learning-rollup` (hourly): joins Pinterest analytics + GA4 events + orders → composite per-dimension score → upserts into existing `pinterest_pattern_weights` AND new `pinterest_winner_dimensions`.
- `pickStrategy` (already epsilon-greedy) reads from new winner dimensions; loser detector flags patterns to throttle.

## Phase 6 — Conversion Intelligence
- Extend `usePinterestTracking` + `/go/:slug` landing to emit custom events: `high_intent_scroll`, `sticky_cta_click`, `gallery_interaction`, `multi_product_view`, `engaged_session`, `pinterest_quality_visit` (GA4 + Clarity tags).
- New edge function `pinterest-capi-relay` scaffold for server-side Pinterest Conversion API (no secret yet — stub that batches events into `pinterest_capi_outbox` table; flips to live once user adds `PINTEREST_CONVERSION_TOKEN`).
- Attribution memory: persist last-touch pin_id in cookie + `pinterest_attribution_sessions` table linked to orders.

## Phase 7 — Pin ↔ Landing Matching
- Extend `pinterest_landing_templates` with `pin_mode` + `aesthetic_tone`. `pickLandingSlug()` (already in director) now also matches by `pin_mode` so cozy pins → cozy landing, luxury → luxury landing, transformation → transformation PDP blocks.
- `PinterestDynamicLanding.tsx` reads `pin_mode` from URL/template and conditionally swaps hero treatment (cozy / luxury / transformation variants).

## Phase 8 — AI Trend Research (Lovable AI Gateway, no external keys)
- New edge function `pinterest-trend-intelligence` (manual + weekly cron): uses `google/gemini-3-flash-preview` with structured tool-calling to generate: rising-niche signals, overused spam styles to avoid, and hook category recommendations. Stores into `pinterest_trend_reports`.
- Director consumes latest report as soft bias on `pickStrategy`.

## Phase 9 — Admin Intelligence Dashboard
- New page `src/pages/admin/PinterestIntelligenceDashboard.tsx` route `/admin/pinterest-intelligence` with tabs:
  - Hook leaders (save / click / conversion / revenue)
  - Aesthetic & pin-mode leaders
  - Product leaders
  - Quality score distribution + rejected pins
  - Trend evolution (line charts from `pinterest_trend_reports` + winner dimensions)
- Lazy-loaded; admin-role gated (matches existing admin-access policy).

## Phase 10 — Auto-Evolution Loop
- Nightly cron `pinterest-evolution-tick`:
  - Pulls winner/loser dimensions
  - Updates pattern_weights (boost winners, decay losers)
  - Writes recommended phase-outs to `pinterest_evolution_log` (admin reviews; no auto-mutate of taxonomies)
  - Adjusts `pinterest-viral-batch` allocation: winning (niche × pin_mode) gets more slots
- Director's brief generator pulls latest evolution recommendations as additional constraints.

---

## Cross-cutting

**Database migrations (single SQL file):**
- `pinterest_performance_signals`
- `pinterest_winner_dimensions`
- `pinterest_capi_outbox`
- `pinterest_attribution_sessions`
- `pinterest_trend_reports`
- `pinterest_evolution_log`
- Add columns to `pinterest_landing_templates` (`pin_mode`, `aesthetic_tone`)
- Add columns to `pinterest_creative_intents` (`pin_mode`, `commerce_archetype`, `aesthetic`)
- All admin-only RLS via existing `has_role(admin)` pattern.

**Type contract:**
- All new fields go on `BackdropMetadata` / `meta.intelligence` JSONB — NOT on `PinterestQueueInsert`. Honors existing pin-queue type contract.

**AI Gateway:**
- Text/strategy: `google/gemini-3-flash-preview`
- Image: `google/gemini-3-pro-image-preview`
- Quality scoring: `google/gemini-2.5-flash`
- No external API keys.

**Compliance:**
- Honors merchant-safe rules: no fake reviews, no price anchoring, no banned terminology. Scene composer already filters.

**Schedules (pg_cron via insert tool, not migration):**
- `pinterest-learning-rollup`: hourly
- `pinterest-trend-intelligence`: weekly Mon 09:00 UTC
- `pinterest-evolution-tick`: daily 03:00 UTC

---

## Delivery order
Given the scope, I will ship in 4 commits, each runnable end-to-end:

1. **Foundation** (Phase 1 + 2 + 4): visual intelligence module, pin modes, 8-axis scoring → director uses them.
2. **Collage + Landing match** (Phase 3 + 7).
3. **Learning + Conversion** (Phase 5 + 6 + 8): tables, rollup function, CAPI scaffold, trend intel.
4. **Dashboard + Evolution** (Phase 9 + 10): admin UI + nightly evolution cron.

Each commit migrates DB + ships code together so the system stays runnable.

---

## Confirmations needed before I start

1. Ship in the 4 sequential commits above (review after each), or all at once?
2. Pinterest Conversion API: scaffold-only now (outbox stays unsent until you add `PINTEREST_CONVERSION_TOKEN`), or skip until you have the token?
3. Auto-evolution: recommendations-only with admin approval (safer), or auto-apply weight changes once sample_size ≥ N?
4. Should `pinterest-viral-batch` reallocation in Phase 10 be on by default, or behind an admin toggle?

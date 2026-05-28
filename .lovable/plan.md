# Conversion Intelligence Mode — Phased Build Plan

The brief covers 10 parts. Shipping all in one pass would risk storefront regressions and hit token/migration limits. Instead, I'll roll it out in **4 conversion-focused phases (CI-1 → CI-4)**, each independently shippable and reversible. After each phase you say `go CI-2` etc.

This plan also tells you what I will NOT build (per your "stop building analytics-heavy admin systems" rule).

---

## What I will NOT build (de-scoped)

- ❌ Heavy new dashboards beyond the two strictly required (Hero Products + Conversion Insights).
- ❌ Net-new tracking tables when existing `funnel_events` / `sessions` / `ai_priority_queue` already capture the signal — I'll extend, not duplicate.
- ❌ Real-time AI on storefront (all AI runs admin-side, draft-only).
- ❌ Any change to Stripe, checkout, canonicals, sitemap, routing, or `merchant-safe` compliance layer.

---

## CI-1 — Conversion Foundations (data + hero priority)

**Goal:** Fix data blindness + introduce hero-product weighting. Pure backend + admin. Zero storefront UI risk.

### Part 1 — Geo + Device Classification (extend, don't replace)
- Extend existing `geo-classify` edge function to also emit `geo_quality` ∈ {`verified`, `probable`, `unknown`, `bot_like`} using cf-ipcountry + UA cross-check.
- New `src/lib/deviceClassify.ts`: lightweight UA parser (no library). Outputs `{ device, browser_family, os_family, in_app_browser, device_confidence }`. Detects TikTok/Instagram/Pinterest/FB in-app webviews via UA tokens (`musical_ly`, `Instagram`, `Pinterest`, `FBAN/FBAV`).
- Persist on session row: `geo_quality`, `browser_family`, `os_family`, `in_app_browser`, `device_confidence` (additive columns).

### Part 2 — Hero Product Layer
- Migration: `product_priority` table → `{ product_id, tier ('hero'|'testing'|'low_priority'|'seasonal'|'clearance'), notes, updated_by, updated_at }`. Admin-only RLS.
- New page `/admin/hero-products`: list all products, set tier, bulk actions.
- Helper `getProductPriority(productId)` consumed by homepage bestsellers, related products, and SEO/creative engines (read-only integration — no storefront re-rank in CI-1, just wired up for CI-2+).

**Ship after CI-1:** report on data coverage gains, no visible storefront change.

---

## CI-2 — Emotional PDP + Mobile Conversion (the revenue lever)

**Goal:** the actual conversion uplift work. Mobile-first, additive blocks, all gated by feature flag so they can be reverted instantly.

### Part 3 — Emotional PDP Blocks
- New component family `src/components/pdp/emotional/`:
  - `EmotionalHook.tsx` — single-line headline above buy box
  - `WhyPetOwnersLoveThis.tsx` — extends existing `WhyPetParentsLoveThis` with category-aware copy
  - `ProblemAgitation.tsx` + `TransformationOutcome.tsx` (paired)
  - `LifestylePositioning.tsx`
  - `EmotionalFaq.tsx` (objection-handling FAQ, distinct from the SEO FAQ)
- Copy is **deterministic, rules-based per category** (cats/litter/dogs/beds/cat-trees) using existing `getBestFor` and `merchant-policy` BANNED_TERMS scanner. No AI on storefront. AI only used admin-side to *suggest* copy edits.
- Hero products get the full emotional stack; non-hero get a trimmed version.

### Part 4 — Mobile Conversion Layer
- New `MobileStickyTrustBar.tsx` (appears at top on scroll, ≤32px, free shipping + 30-day returns + secure checkout).
- Enhance existing `PdpStickyAtc` with category-aware CTA label from emotional layer.
- `SwipeBenefitChips.tsx` — horizontally-scrollable benefit chips above gallery on mobile only.
- Scroll-triggered `ReassuranceCallout.tsx` (single observer, lazy, mobile-only).
- All gated behind `useSeoFeatureFlags`-style flag system → instant rollback.

**LCP/CLS guard:** all new mobile blocks use `contain: layout`, are below-the-fold, and have reserved heights.

---

## CI-3 — Traffic Quality + Landing Match (intelligence)

**Goal:** turn the data from CI-1 into actionable insights. Admin-only.

### Part 6 — Traffic Source Quality Scoring
- Extend `ai-traffic-classify` edge function with a `source_quality` output ∈ {`premium`, `good`, `weak`, `curiosity_only`, `suspicious`} computed from: dwell, scroll depth, repeat visits, ATC events, in-app browser flag, geo_quality.
- Store on `sessions.source_quality` (additive column).
- Surface "true high-intent traffic %" tile on existing `AiExecutivePage`.

### Part 5 — Landing Page Match Analyzer (admin tool)
- New edge function `ai-landing-match` (admin-gated): takes `{ landing_url, ad_hook, ad_image_url }`, fetches landing snapshot via existing prerender, runs Gemini 2.5 Flash with a structured-output schema to score continuity (headline match, visual match, promise clarity) 0–100 + recommendations.
- Adds tab to `AiCreativesPage` — no new top-level admin page (per "stop building dashboards" rule).

---

## CI-4 — Conversion Insights + Product Prioritization (decision layer)

**Goal:** wire CI-1/2/3 outputs into the existing `ai_priority_queue` so they show up on `/admin/ai-executive` as ranked actions.

### Part 7 — AI Conversion Insights
- New insight type `conversion_friction` in existing `ai_insights` table.
- Rules engine (no LLM) detects:
  - "Scroll deep but no CTA reach" (scroll>60% & no atc_view event)
  - "Mobile gallery engaged, copy ignored"
  - "TikTok abandon after price view"
  - "Source X converts Nx better than source Y"
- Optional Gemini-pass synthesizes into a 1-line narrative per insight.

### Part 9 — AI Product Prioritization
- Extend existing `ai-revenue-insights` `winner_score` with a `conversion_potential_score` factoring source_quality and emotional-block engagement.
- Outputs: breakout / weak / dead-traffic-magnet / homepage-candidate / ad-scale-candidate labels — surfaced on the existing AiRevenue page, not a new one.

### Part 8 — Visual Trust System
- A `trust_blocks_config` JSON in existing site settings (no new table). Toggles US-shipping/returns/support/small-business modules per page.
- Used by `ConversionTrustBlock` and new `MobileStickyTrustBar`.

---

## Safety, performance, compliance (applies to every phase)

- **Storefront bundle:** every new admin page is lazy-loaded via `React.lazy`. All AI runs in edge functions, never on storefront.
- **Reversibility:** all new PDP/mobile blocks behind feature flags. Setting `false` returns the page to today's exact render.
- **Compliance:** every generated/edited string passes `scanForBannedTerms` from `@/config/merchant-policy`. CI fails if banned terms ship.
- **Approval-first:** AI suggestions land in `ai_priority_queue` with status `pending`. Nothing auto-publishes, nothing auto-prices, nothing auto-canonical.
- **No touch:** Stripe, webhooks, checkout, canonicals (`#gp-canonical` hook), sitemap, robots, routing.

---

## Deliverable after each phase

A short report with: what shipped, conversion hypothesis, expected impact, risk, rollback steps, and the highest-priority next action.

---

## Confirm / adjust

Reply **`go CI-1`** to start, or tell me to merge/reorder phases. If you want me to skip a part entirely (e.g. you don't want the Landing Match Analyzer), say so now so I don't build it.

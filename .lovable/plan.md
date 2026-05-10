## Pinterest Ecommerce Growth Engine — Implementation Plan

The current stack already has: `pinterest-creative-director` (niche → strategy → render → score), `pinterest-quality.ts` (5-axis scorer + retries), `pinterest-patterns.ts`, `pinterest-style-dna.ts`, `pinterest-niche-rules` admin editor, and a single `/go` route. We will extend — not replace — these systems.

This is a large, multi-month engine. I propose shipping it in 4 phases. Each phase is independently usable and measurably moves the needle.

---

### Phase 1 — Congruency + Dynamic Landing Pages (Sections 1, 2, 9)

Goal: every pin has a matching premium, mobile-first landing experience, and the pin↔page metadata round-trips.

**DB**
- `pinterest_creative_intents` — per-pin: hook_type, emotional_angle, visual_style, lifestyle_category, cta_style, color_palette, audience_intent, landing_slug.
- `pinterest_landing_templates` — slug, hero_copy, lifestyle_imagery refs, trust_block_variant, cta_tone, color_atmosphere, product_id(s), niche_key.
- Seeded with 8–12 starter slugs (`litter-stress`, `calm-car-rides`, `cozy-cat-home`, `no-more-fur`, etc.).

**Edge functions**
- Extend `pinterest-creative-director` to write `pinterest_creative_intents` and stamp the queue row's `landing_url` to `/go/{slug}?hook=...&intent=...&pin_id=...`.
- New `pinterest-landing-resolver` — given a slug + hook + intent, returns the composed landing payload (hero copy, lifestyle blocks, trust block, CTA wording, palette tokens, recommended product).

**Frontend**
- New dynamic route `/go/:slug` rendering `<PinterestDynamicLanding/>` with: emotional hero, lifestyle gallery, transformation narrative, social proof block, premium trust stack, sticky CTA, scroll-triggered urgency reveal (reusing existing `lp_urgency_revealed` + Clarity events).
- Reuse `PinterestLandingBanner`, `TrustStack`, `WhyCustomersChoose` for continuity.
- Mobile-first only; passes the existing safe-area + readability layout engine.

---

### Phase 2 — AI Trust Optimizer + Auto Quality Scoring (Sections 3, 8, 11)

Goal: nothing low-quality reaches Pinterest visitors — for both pins AND landing pages.

**Pins**
- Extend `pinterest-quality.ts` scorer from 5 → 8 axes: + `emotional_resonance`, `luxury_aesthetic`, `conversion_potential`. Threshold 78 stays; per-axis floors added. Max 2 retries (already in place).
- Save-Optimization heuristics: penalize aggressive ad cues (loud CTAs, busy collages), reward inspirational composition + whitespace.

**Landing pages**
- New `pinterest-trust-optimizer` edge function — runs on a sampled basis against rendered `/go/:slug` HTML using Lovable AI multimodal scoring.
- Scores: trust, visual quality, dropship signal, emotional resonance, CTA visibility, mobile UX, review visibility, shipping/return clarity, premium feel.
- Low scores → write recommended copy/layout patches into `pinterest_landing_recommendations` for admin review (no auto-mutate of live pages without approval).

**Admin UI**
- New tab on `/admin/pinterest-pin-status` showing per-pin 8-axis scores + auto-rejected filter.
- New page `/admin/pinterest-trust-optimizer` listing landing pages ranked by trust score with one-click "apply recommendation" actions.

---

### Phase 3 — Competitor Intelligence + Lifestyle Composition (Sections 4, 7, 10)

Goal: the visual quality jumps from "AI pin" to "premium Pinterest brand".

**Competitor pattern intelligence**
- Extend `pinterest-pattern-research` (Perplexity already wired) to ingest top US pet/lifestyle Pinterest pins weekly.
- Extract structured patterns: hook_structures, typography_styles, layout_structures, cta_positions, emotional_angles, lifestyle_compositions, whitespace_usage, color_palettes, transformation_storytelling, visual_hierarchy.
- Persist in `pinterest_competitor_patterns` (strategy only — no asset copies). Feed into `pickStrategy()` weights.

**Lifestyle integration upgrade**
- New `pinterest-scene-composer` shared module. Replaces "PNG-on-backdrop" with full scene briefs that direct the image model to embed the product into a coherent room/scene with realistic perspective, shadows, and depth.
- Per-niche scene libraries (luxury bathroom, Scandinavian living room, sunlit reading nook, SUV interior, cozy roadtrip, etc.) — referenced by name, generated fresh each time.
- Reject renders that fail an "object-in-scene" multimodal check.

---

### Phase 4 — Creative Evolution Loop + Product Prioritization (Sections 5, 6, 12)

Goal: the system biases toward winners automatically and stops spending generation budget on low-potential products.

**Evolution loop**
- New `pinterest-winner-rollup` cron (already noted as pending in `pinterest-creative-intelligence` memo). Pulls Pinterest analytics + GA4 (impressions, saves, outbound CTR, engagement, ATC, checkout, purchases, session duration, bounce, conversion) + Profit Engine verdicts.
- Computes composite_score per pin → rolls up into `pinterest_pattern_weights` keyed by `(pattern_id, hook_category, niche_key, lifestyle_style, cta_style, palette)`.
- `pickStrategy()` reads the latest weights with epsilon-greedy exploration (already present).
- Admin "Top performers" table on `/admin/pinterest-patterns`.

**Product prioritization**
- New `pinterest_product_opportunity_scores` table.
- Nightly `pinterest-product-scorer` edge function uses Lovable AI to score each active product on: pinterest_compatibility, emotional_potential, save_worthiness, visual_appeal, lifestyle_integration, impulse_potential, transformation_potential, cozy_aesthetic_fit → composite "Pinterest Opportunity Score".
- `pinterest-viral-batch` queue planner reads scores and allocates generation slots proportionally (high score = more variants, low score = throttled).
- Admin page `/admin/pinterest-opportunity-scores` with sortable list + manual override.

---

### Technical details

- All AI calls stay on Lovable AI Gateway (`google/gemini-3-flash-preview` for strategy/text, `google/gemini-2.5-flash` for multimodal scoring, `google/gemini-3-pro-image-preview` for image renders). No new API keys.
- All new tables get admin-only RLS via existing `has_role(auth.uid(), 'admin')` pattern. Public landing-page reads go through a Security Definer view, no service-role exposure.
- `pinterest_pin_queue` insert contract is preserved — new fields go on `BackdropMetadata`/intelligence meta JSONB only, per the existing type contract.
- `/go/:slug` follows existing SEO/canonical/H1 rules: single H1, `useCanonical` to `#gp-canonical`, structured data via existing helpers, geo-aware consent respected.
- Heatmap/Clarity event taxonomy on `/go/:slug` reuses `lp_urgency_revealed`, `cta_click`, misclick + repeat-click detection. UTM unchanged.
- New SQL migrations: 4 (one per phase). No edits to existing migrations.

---

### What I need from you before Phase 1

1. **Scope confirmation** — ship all 4 phases sequentially, or start with Phase 1 only and review before continuing? (Phases 2–4 each depend on Phase 1's intent metadata.)
2. **Initial `/go/:slug` set** — go with my proposed 8–12 starter slugs, or do you want to supply the list?
3. **Trust Optimizer mode** — recommendations only (admin approves), or auto-apply when score is above a confidence threshold?
4. **Product prioritization** — should low-score products be fully paused from queue generation, or just throttled (e.g. 1 pin/week)?

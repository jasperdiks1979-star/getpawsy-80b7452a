---
name: Pinterest Growth Engine — Phase 1 (Congruency)
description: Per-pin creative intent + dynamic /go/{slug} landings linked to pinterest_landing_templates
type: feature
---
**Engine pieces (Phase 1 of the Pinterest Ecommerce Growth Engine):**

- `pinterest_landing_templates` (admin manage, public read where `enabled=true`) — slug, niche_key, hook_type, emotional_angle, hero copy, CTA label/tone, color_atmosphere, transformation before/after, recommended_product_slug + recommended_collection_slug. Seeded with 10 starter slugs: `litter-stress`, `calm-car-rides`, `cozy-cat-home`, `no-more-fur`, `calm-bedtime`, `cat-owners-love-this`, `orthopedic-relief`, `fresh-water-everyday`, `boredom-fix`, `mealtime-made-easy`.
- `pinterest_creative_intents` (admin only) — per-pin: pin_queue_id, niche_key, hook_type, emotional_angle, visual_style, lifestyle_category, cta_style, audience_intent, landing_slug. Written by `pinterest-creative-director` after each queue insert.
- `pinterest-landing-resolver` edge function (public GET, `?slug=&hook=&intent=`) — returns `{ template, products[] }` with hook/intent overrides applied.
- `/go/:slug` route → `src/pages/landing/PinterestDynamicLanding.tsx` — mobile-first hero, transformation before/after, companion grid, TrustStack, WhyCustomersChoose, sticky CTA. Always `noindex,follow`. Sets Clarity tags `go_slug`, `go_hook`, `go_intent`, `go_pin_id`. UTMs preserved on outbound CTA.
- `pinterest-creative-director` now calls `pickLandingSlug(niche, hook)` and routes `destination_link` to `/go/{slug}` when a template exists, else falls back to PDP. Hook/intent params travel on the URL for congruency.

**Future phases (not yet built):** Phase 2 = AI Trust Optimizer + 8-axis scorer; Phase 3 = competitor intelligence + scene composer; Phase 4 = winner rollup + product opportunity scoring.

---
name: Pinterest AI Creative Director
description: Per-product niche detection + AI scene generation for Pinterest pins (no templates, no floating product cards)
type: feature
---
**Engine:** `supabase/functions/pinterest-creative-director` with actions `profile_product`, `generate_briefs`, `render_pins`, `run_full`.

**Style DNA:** `_shared/pinterest-style-dna.ts` defines 11 niche presets (cat_litter, dog_car, cat_tree, dog_harness, calming_bed, dog_bed, cat_fountain, interactive_toy, grooming, feeder, generic_pet). `detectNiche()` matches on product name/slug/category.

**Cache table:** `product_creative_profiles` (admin-only RLS). `force=true` re-detects.

**Flow:** profile → `generate_briefs` (Lovable AI text model + tool call returns N scene briefs with composition/headline≤42/cta≤18/full_prompt) → `renderScene` (default `google/gemini-3-pro-image-preview`, vertical 9:16, NO text-in-image directive) → quality filter (size 80KB–8MB, headline/cta length, banned terms) → upload to `pinterest-ads/creative-director/{slug}/` → insert as `pinterest_pin_queue.status='draft'`.

**UTM:** `utm_campaign=creative_director&utm_content={niche}&hook={emotional_hook}`.

**No auto-publish** — drafts always require human approval via existing `bulk_approve` path.

**Admin UI:** "AI Creative Director" panel on `/admin/pinterest-pin-status` (slug + count + force re-detect, shows draft thumbnails + rejected reasons).

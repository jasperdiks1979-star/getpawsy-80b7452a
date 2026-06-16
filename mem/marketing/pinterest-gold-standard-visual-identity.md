---
name: Pinterest gold-standard visual identity
description: Premium lifestyle photography defaults, 2–5 word overlays, banned creative formats for all Pinterest pin generation
type: design
---
Default visual identity for ALL Pinterest creatives (creative-director + downstream):
- Premium lifestyle photography, warm natural lighting, luxury US home interior
- Photorealistic AI render, product integrated naturally into the scene
- Pinterest-native 2:3 (1000x1500), minimal overlays
- Distribution target: 70% premium lifestyle / 20% product-in-use / 10% educational

Overlay rule: 2–5 words, single short benefit. Enforced in `validatePinCopy`
(`pinterest-board-templates.ts`) via `OVERLAY_MIN_WORDS=2`, `OVERLAY_MAX_WORDS=5`.
Examples: "Loved by US pet parents", "Built for happy climbers", "Cleaner litter less work",
"Reduces mess", "More play less boredom", "Designed for daily use", "Made for cozy naps".

Forbidden creative formats (hard-banned in director system prompt and styleSuffix):
infographics, feature lists, comparison graphics, discount banners, product collages,
multi-tile / split-screen layouts, ecommerce catalogue look, floating product cutouts,
Canva templates, CTA bars, price tags, stock-photo appearance, crowded layouts.

Priority niches: Cat Trees, Cat Beds, Litter Products, Automatic Litter Boxes,
Dog Feeding Stations, Pet Furniture.

Collage modes (`before_after`, `moodboard_collage`) are remapped to single-scene
lifestyle in `pinterest-pin-modes.ts` (`is_collage=false`) — never emit multi-tile.

Scoring (existing `pinterest_pattern_weights` composite_score, used by
`pinterest-auto-evolve`): increase on higher save rate / outbound CTR / engagement;
decrease on too-much-text, promotional look, catalogue look. No new tables.
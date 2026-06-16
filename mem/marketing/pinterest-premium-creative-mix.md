---
name: Pinterest premium creative mix (Phase 2)
description: 80/10/10 creative split, approved overlay bank, Scandinavian beige aesthetic — official brand standard
type: design
---

Official GetPawsy Pinterest creative standard (Phase 2).

Mix per batch:
- 80% luxury lifestyle (room is hero, product naturally placed)
- 10% product-in-use (pet actively interacting)
- 10% gentle educational (still photographed, never infographic)

Aesthetic defaults:
- Premium lifestyle photography, warm sunlight
- Scandinavian interiors, natural wood, beige neutral palette (cream/oat/warm white)
- Realistic pets, emotional storytelling, Pinterest-native vertical 1000x1500

Overlay rules (enforced in `_shared/pinterest-board-templates.ts`):
- 2–5 words max, ≤32 chars, single line, no `|`/`•`
- Approved bank: "Loved by US pet parents", "Built for happy climbers",
  "Cleaner litter less work", "Improves comfort", "Designed for daily use",
  "Pet parent approved", "More play less boredom", "Made for cozy naps"

Forbidden: catalog pins, comparison graphics, infographics, text-heavy creatives,
generic ecommerce ads, CTA bars, price tags, discount banners, multi-tile collages.

Learning loop persists winners in `pinterest_pattern_weights`; underperformers
(>=400 imp & CTR<=0.3% or save<=0.5%) move to `pinterest_loser_blocklist`.
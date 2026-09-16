# Findings — Phase 0 catalog audit (read-only)

## 1. The catalog is far too wide for the intended brand

774 products, 342 commercially visible, spread over cat, dog, bird and unclassified ranges.
The target is a cat-first indoor-home brand with roughly 45–60 visible products, so about
**85% of the visible catalog is outside the intended brand** or below quality standard.

## 2. There is a strong, coherent cat core underneath

- 220 cat products; **63** of them have US stock and pass every per-product hard gate.
- Cat depth: Cat Trees & Condos 80, Cat Litter Boxes 60, Cat Toys 33, Cat Houses 11, Cat Beds 11,
  Scratching Posts 11, plus small bowls/carriers/grooming tails.
- 48 cat products qualify as HERO_CANDIDATE (score ≥72, no blocking gates, US stock).
- That is more than enough to build a 45–60 product cat-first assortment without buying anything new.

## 3. Litter boxes are the clearest hero family (evidence-backed)

The top of the ranking is dominated by enclosed/odor-control litter boxes: they combine real US
stock, 42–60% margin, $76–$141 price points, strong problem language and the only meaningful
90-day traffic in the catalog. The current highest-scoring product (87/100) is also the
highest-traffic product (136 views / 90 days) — the litter box PDP already upgraded earlier.

Provisional hero shape (5 slots, to be confirmed in Phase 1, not applied):
1. Enclosed anti-splash / odor-locking litter box (the current traffic leader).
2. Extra-large or stainless high-sided litter box (premium price anchor).
3. Top-entry enclosed litter box (second litter format, 300 US units).
4. Multi-level cat tower with sisal posts (visual/UGC anchor, 6,594 US units).
5. Cat stairs / cat house furniture piece (indoor-home positioning).

## 4. Systemic data gaps to repair before any merchandising decision

| Gap | Scale | Impact |
| --- | --- | --- |
| `shipping_days_min/max` empty | 774 / 774 | No product can carry a defensible delivery promise from data |
| No stock anywhere | 236 | Cannot be sold; currently inflating the catalog |
| Supplier discontinued | 107 | Sellability risk even where stock columns still show units |
| Margin < 35% | 211 | Below an acceptable paid-traffic economics floor |
| Copy under 250 chars | 53 | Not PDP-ready |
| Confirmed duplicates | 59 | Plus 68 near-duplicate clusters covering 175 products |
| Inventory manually blocked | 27 | Deliberately unsellable; should not sit in the visible catalog |
| Stock column 0 while CJ variant payload shows US units | several | Inventory sync lag — needs a re-sync before trusting either value |

## 5. Demand evidence is thin

9,443 product views and 230 add-to-carts over 90 days, but only 2 purchase events (one being the
authorised $2 live smoke test). Traffic and conversion history therefore cannot rank products on
their own; the scoring leans on margin, US stock, supplier reliability and content quality, with
traffic used only as a tiebreaker. This is flagged as inference, not evidence of demand.

## 6. Evidence vs inference

- **Evidence (database):** price, cost, margin, stock per warehouse, supplier mapping and status,
  sync recency, variants, images, description length, quality scores, SEO fields, duplicates,
  90-day views/add-to-carts, paid order lines.
- **Inference (heuristic):** problem-solved, differentiation, UGC potential, bundle potential and
  part of the return/damage score are derived from title/description language and category, not
  from measured customer behaviour. These are marked in every row's `inference` column.

## Recommended next safe phase

**Phase 1 — Cat-first assortment proposal (still read-only, no catalog mutation).**

1. Re-sync inventory and shipping windows for the ~120 shortlisted cat products so shipping
   promises and stock come from live supplier data rather than stale columns.
2. Resolve the 68 near-duplicate clusters into canonical products on paper (keep/merge/retire map).
3. Produce a proposed 45–60 product cat-first assortment with exactly 5 heroes, each with named
   evidence, and a matching retire/hide list for everything outside it.
4. Only then, as Phase 2, apply visibility changes in a reversible, batched way — with prices,
   stock, orders and supplier state untouched.

No live financial or external action was taken in this phase.

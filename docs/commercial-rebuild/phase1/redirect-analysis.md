# Retire list — redirect / index analysis (read-only)

Source: `retire-redirect-map.json` (generated from the Phase 1 proposal + 90-day traffic).

| Signal | Count |
| --- | --- |
| Products outside the proposed range | 653 |
| Of those, indexable today (active + slug + meta title) | 308 |
| With meaningful 90-day traffic (≥20 views) | 184 |
| With low traffic (1–19 views) | 80 |
| With no traffic at all | 389 |
| With an automatic same-category redirect target | 353 |

## What this means for Phase 2

1. **389 no-traffic pages** can be hidden and de-indexed with no SEO cost — the safest first batch.
2. **80 low-traffic pages** can be hidden with a 301 to the best remaining product in the same category.
3. **184 pages carry real traffic and need human judgement before anything is hidden.** Most are dog, bird or outdoor products, so the automatic "nearest keeper in the same category" target is often a poor match (a dog ramp pointing at a cat bed). These need either a dog/other-species collection page to redirect into, or a decision to keep the range alive while the cat-first storefront is built in front of it.

Recommended Phase 2 sequence, each batch reversible:
1. Hide + de-index the 389 zero-traffic products.
2. Hide the 80 low-traffic products with same-category 301s.
3. Decide the fate of the 184 trafficked non-cat products as an explicit commercial choice, not an automated sweep.
4. Only then apply role flags (hero/core/accessory) and re-merchandise navigation and the homepage.

No page was hidden, redirected or de-indexed in this phase.

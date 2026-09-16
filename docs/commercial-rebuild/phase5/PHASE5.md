# Phase 5 — Commercial launch readiness (live)

## Changes
1. **Cat-first navigation** — `Navbar.tsx` links: Home, Cats, Litter Boxes, Cat Trees, Cat Toys, Sets (/bundles), Guides, Contact. Legacy dog/outdoor pages stay live and indexable, reachable via footer + sitemap, out of primary nav.
2. **Shop hub pruned** — `ShopHub.tsx` shows only categories that hold merchandised stock (litter & hygiene, climbing & rest, play & feeding). Thin categories route to filtered `/products` views instead of empty collection pages.
3. **Collection pages reactivated** — `seo_collections.is_active = true` for `cat-toys` and `cat-beds` (previously redirected to /products). Slug aliases corrected in `canonical-category-registry.ts`.
4. **Legacy leakage closed** — `collection-matching-engine.ts` now restricts the primary cat collections (`cats`, `cat-litter-boxes`, `cat-trees-and-condos`, `cat-toys`, `cat-beds`) to `merch_hidden = false`. Legacy/dog collections keep their full pool, so the protected 244-page layer is unchanged and still indexable.
5. **No unverifiable ranking claims** — ProductCard badges and `top-winners.ts` labels all read "Our pick"; `/bestsellers` rewritten as "Our Picks" (curation, not sales data) with FAQ answers limited to checkable facts; homepage row is "Our Cat Essentials" sourced from `products_shop` hero|core by `merch_rank`, ratings only from `product_reviews`.
6. **Shipping truth** — free-shipping copy states the threshold rather than implying universal free shipping.
7. **Regression tests** — `trust-claims.test.ts` now also blocks sales-ranking badge labels and asserts the primary-collection merch filter stays in place.

## KPI verification (source reconciliation)
- `canonical_orders`: 5 rows, $219.98 — exactly matches `orders where status='paid'` (5, $219.98).
- Order states overall: 40 expired, 5 paid, 1 pending. Rates stay suppressed below 10 paid orders; margin labelled not available.

## Verification
- 1017 tests + 7 new assertions pass; typecheck clean; build OK.
- Security: no critical findings (scan results stale for the latest commit; none outstanding).
- Live smoke (getpawsy.pet, 200 each): /, /shop, /bundles, /products, /cart, /checkout, /track-order, /sitemap.xml, /robots.txt, /collections/cats, /collections/cat-litter-boxes, /collections/dog-beds (legacy), /bestsellers, and all 5 hero PDPs.

## Still open (no invention possible)
- Heroes 1/4/5 lack documented specs; PDPs omit those claims rather than guess.
- 72 placeholder reviews remain unapproved and excluded from every public rating.
- Review-request emails built, disabled pending explicit approval.
- No refill/subscription layer: the range is durable hardware only.

No payment, refund, supplier order, customer email, ad spend or external publishing occurred.

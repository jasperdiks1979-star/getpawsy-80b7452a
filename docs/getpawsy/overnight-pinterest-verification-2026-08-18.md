# GetPawsy Overnight Pinterest & Commerce Verification — 2026-08-18

Verdict: GETPAWSY_OVERNIGHT_REVIEW_PARTIAL

## Queue
- gp25_high_potential: PARTIAL — 24/25 live (gp25-19 absent; creative spec not recoverable in this sandbox)
- BEST_PRODUCT_5 (getpawsy_best_product_push): COMPLETED — 5/5 live
- NEXT_2_BEST_PRODUCTS_10 (getpawsy_next_2_products_push): COMPLETED — 10/10 live
- Duplicate-avoidance run: COMPLETED

## Pins
39 session pins live across 7 products and 11 boards.
UTM: 0 malformed, 0 duplicate utm_content, 0 legacy /product/ routes, 0 cross-brand links.
Titles/descriptions: 0 exact duplicates, all pins have alt text.

## Catalog truth (all destinations)
All 7 destination slugs resolve to is_active=true, is_duplicate=false, stock>0 products,
prices matching the live PDP (396.99 / 120.00 / 96.99 / 85.49 / 51.49 / 29.95 / 9.99).

## Commerce
7/7 PDPs render correct price, correct media, Add to Cart enabled, no sold-out state.
Add to Cart writes correct cart payload; cart page renders the item.

BLOCKER (published build only): the deployed data-healer bundle rewrites `pawsy-cart`
to `{"items":[]}` on load, emptying the cart on the next page load/reload.
Current source code already heals the array shape correctly and reproduces clean on
the preview build — the fix is unpublished. Requires a publish.

## Repairs made
- src/components/cart/CartUpsell.tsx: product IDs were split on "-", truncating UUIDs and
  causing 400s on every products_public upsell lookup. Now uses the full UUID.

## Analytics / infra
- log-crawler-visit 400, track-checkout-funnel 400, update_session_heartbeat 500 → ANALYTICS_NON_BLOCKING
- REST API healthy (200), no PGRST002, no schema-cache failure, no runaway job loop observed.
- Pinterest API: auth valid, board and pin reads OK. pin_edit remains unavailable (no metadata/board edits attempted).
- Pinterest metrics scopes unavailable → no impressions/clicks/saves baseline can be recorded.

## Mutation ledger
1. Code edit: src/components/cart/CartUpsell.tsx (UUID handling).
2. Docs: this file.
No Pinterest pins created, edited or deleted. No Shopify/catalog mutation. Ailurova untouched.

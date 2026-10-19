# GetPawsy — conversion-first recovery gates (19 October 2026)

## Why this is separate from analytics PR #15
The business objective is successful, trustworthy customer purchases. Bot-label repair improves measurement, but does not itself generate sales. Keep commerce fixes in a small independent PR to reduce production risk.

## Read-only production database observations
- `products`: 432 active rows, all with positive base price.
- `canonical_sessions` last seven days (by last_seen_at, mutually exclusive latest stage): 7,129 page-view; 914 product-view; 5 cart; 10 checkout. These are **session labels, not a validated human funnel**; do not treat as conversion rates.
- The five cart-stage sessions are labeled bot; checkout-stage sessions: 4 human, 5 internal, 1 bot. Classification is known unreliable and must not be treated as proof of actual human purchases.
- `orders` last 30 days: seven expired, zero paid. Expired rows may include testing; no confirmed completed purchases.

## Product trust audit: stainless-steel manual litter box
- Product ID `1daefaa0-7892-4760-87a9-0aa34c49c767`, verified from the live production products row: stainless-steel body, lid, scoop and litter mat. No automatic cleaning, app or sensor documented.
- Public search-cached product page (crawled ~2 weeks earlier) mixed automatic waste removal/sensors/app claims with the manual product. **Do not assert this exact cached HTML is the current live render without a browser fetch.**
- Product base price `products.price = 96.99`, three option selling prices `97.95`, with positive US inventory. Current main code already computes advertised/charged variant prices using `listingPrice` and `customerUnitPrice`, with existing regression tests. Do not change the DB price until real checkout and rendered PDP parity is checked.
- This PR adds SKU-specific verified copy and hides generic category claims; five new tests are written, not yet executed against exact PR HEAD.

## Conversion P0 validation before release
1. Full Vitest/TypeScript/build on exact commerce PR HEAD; inspect actual mobile and desktop rendered product page for misleading claims that survive the override.
2. Verify variant selection, advertised price, cart price, shipping and tax calculation, and Stripe amount on an **unpaid** test checkout; stop before payment. Do not create a real paid order.
3. Verify supplier US stock and fulfillment availability for selected product; avoid fabricated stock or delivery promises.
4. Inspect checkout errors, expiration reasons and Stripe events in read-only logs, using redacted identifiers; separate tests, bots and human attempts before drawing conclusions.
5. Verify trust basics: contact, shipping/returns, business details, no fabricated testimonials or supplier claims.
6. Stage in isolated environment, then deploy with rollback only when full gates pass. No guarantee of sales; measure genuine US shopper product views, add-to-cart, checkout and completed payments after release.

## Deployment disposition
PR remains DRAFT. No production code, prices, orders, payments or marketing campaigns changed.

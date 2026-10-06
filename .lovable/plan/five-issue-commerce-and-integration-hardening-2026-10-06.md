# Five-Issue Commerce and Integration Hardening

## Goal
Keep the recovered storefront healthy while resolving only confirmed customer or revenue risks from the five reported findings.

## Implementation
1. **Checkout reuse:** separate a shopper's checkout attempt from cart contents, reject reuse of any paid/completed order, and retain idempotency only for retries of the same unpaid attempt. Add regression coverage without creating orders or payments.
2. **Option safety:** route multi-option quick-add actions to product selection and strengthen the central cart guard so invalid bare lines cannot remain. Preserve the established price authority.
3. **Merchant feed:** validate live XML, Merchant-facing routing, current catalog gates, canonical URLs, prices, and availability. Change only proven broken required endpoints.
4. **Product videos:** verify active media and private-bucket delivery. Keep buckets private when signed storefront URLs already provide narrow read access; change policy only if real playback is blocked.
5. **AOS integration:** confirm whether the orchestrator still invokes it and compare every query to the live schema. Repair active mismatches with tests; do not revive unused architecture.

## Technical details
- No checkout price, payment, fulfillment, order history, SEO canonical, analytics classification, or shipping-policy changes.
- No real payments or test orders.
- Preserve existing data and row-level security.
- Run focused regression tests, typecheck, the full test suite, production build/indexability gates, and database health checks.
- Publish once only after every applicable gate is green, then verify live storefront, feed, videos, and safe checkout behavior.

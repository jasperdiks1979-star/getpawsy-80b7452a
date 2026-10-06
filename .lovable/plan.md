# Final shipping-policy consistency patch

## Scope
- Verify the actual free-shipping rule from the canonical cart and checkout implementations, approved policy constants, policy pages, and any store-owned content.
- Audit all shopper-visible shipping claims across rendered pages, prerender/static SEO output, guides, cart, banners, and footer.
- Normalize only overbroad claims to the exact authoritative wording; do not alter shipping calculations, commerce, prices, orders, payments, fulfillment, or supplier data.
- Add a regression test that ties public threshold claims to the approved policy wording.

## Validation and release
- Run focused tests, TypeScript checks, the full test suite, production build/SEO coverage, and database health/lock checks.
- Publish only if every gate is green.
- Verify the live homepage, one collection, one product, cart-facing messaging, shipping policy, and returns policy without placing an order.

## Technical details
- Preserve the existing threshold and calculation logic.
- Prefer centralized approved copy/constants for React surfaces; update static/prerender strings only where they are actually shopper-visible.
- Keep ad-export/admin-only material out of scope unless it is rendered by the storefront.

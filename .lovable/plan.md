# Production homepage consistency repair

## Scope
- Confirm the exact five documented hero products and current policy wording before changing customer-facing output.
- Align every homepage delivery path: raw HTML, no-JavaScript fallback, boot recovery, hydrated homepage, crawler metadata, and cache/version recovery.
- Keep Security B, checkout, payments, orders, admin access, analytics, catalog URLs, and indexing safeguards unchanged.

## Implementation
1. Replace stale static homepage and no-JavaScript copy with one factual cat-first message, current cat imagery, free-shipping threshold, 30-day returns, and checkout-confirmed delivery wording.
2. Remove broad dog-first and unsupported popularity/ranking language from the active hydrated homepage; feature only the exact five commercial-rebuild heroes and validated cat categories/Sets.
3. Make successful React startup remove any static/recovery remnants, while retaining the existing one-reload failure recovery and cache-version safeguards.
4. Target only publicly rendered guide/template claims that still contradict the evidence rules; preserve URLs and useful factual content.
5. Add regression coverage for stale shell phrases, assets, shipping promises, hero identity, and successful-boot recovery behavior.

## Verification and release
- Run focused tests, then the full suite and TypeScript checks; rely on the platform production build result.
- Test desktop and mobile homepage rendering, recovery absence, key storefront/admin-boundary/SEO routes, all five hero pages, and raw HTML semantics.
- Re-run security checks, update the execution ledger, publish only when green, then verify production HTML and hydrated pages.

## Assumptions
- The active homepage is the route exported by `src/pages/Index.tsx`; legacy homepage code will be made claim-safe but not substituted into the active route.
- Exact delivery-day claims remain absent unless the existing evidence layer marks them authoritative.

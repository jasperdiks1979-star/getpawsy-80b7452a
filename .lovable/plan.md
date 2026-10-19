# Five controlled commercial corrections

Starting version: `9b71197633a187179cb130adc3b06944ee8e3555`; worktree confirmed clean.

## Changes
1. Consolidate commercial funnel readers onto the existing canonical classification contract. Confirmed bot, internal and technical exclusions take precedence; UNKNOWN stays separate. Count distinct sessions/visitors rather than events and deduplicate repeated cart callbacks without suppressing separate intentional additions. Preserve historical data.
2. Make PDP and product-list structured prices use the existing customer-price authority and the displayed active variant. Cover Pink $162.99, Light grey $164.99, windmill $36.95 and manual RVS litter box $97.95. No catalog or checkout price changes.
3. Preserve existing SEO eligibility, including tier C exclusion. Align hydrated robots with prerender/sitemap decisions and keep canonical ownership unchanged.
4. Remove the double-bowl cervical-protection claim from shopper and crawler wording; inspect related generated claims and remove unsupported promises without inventing attributes.
5. Standardize the verified free-shipping threshold to “on orders $35+”; clarify only established return terms. Retain Skidzo identity and explicitly list policy details needing owner confirmation.

## Verification and safeguards
- Add concrete regression tests for classification, distinct funnel counts/cart callbacks, variant prices and SEO eligibility; run focused and full Vitest.
- Verify relevant preview interactions without creating orders or payment sessions; preview is not production evidence.
- Inspect final diff, preserve GA4/consent, Stripe, deferred payment-security patch, ads and PR14–19.
- Check database health using compact precomputed metrics; no historical scans or database writes.
- Do not run prohibited manual builds/typechecks or publish. Independent typecheck, production prerender and rollback validation remain release blockers.

## Technical scope
Reuse `commercialInclusion`, `customerUnitPrice`/`listingPrice` and existing SEO policy sources. Any required server reader changes must be staged outside automatically deployed functions, without migrations or deployment. Report any consumers that cannot safely be consolidated without a separately approved server change; do not claim complete coverage without evidence.

## Delivery
Provide per-fix evidence, exact focused/full test counts, final recorded version or diff identity, changed files and remaining release/policy blockers. Nothing will be described as live.
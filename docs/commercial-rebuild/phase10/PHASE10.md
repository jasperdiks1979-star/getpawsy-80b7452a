# Phase 10 — Final non-external commercial closure

Date: 2026-09-16. No external or financial action was taken: no supplier message,
no customer email, no ad spend, no payment, refund, or CJ order.

## 1. Customer-revenue KPI (COMPLETE)

Production readback of every paid row in `orders`:

| email | amount |
|---|---|
| jasperdiks@hotmail.com | $1.00 |
| jasperdiks@hotmail.com | $0.50 |
| jasperdiks@hotmail.com | $0.50 |
| jasperdiks1979@gmail.com | $118.99 |
| jasperdiks@hotmail.com | $98.99 |

All five are owner purchases (three are live payment smoke tests). Real customer
revenue is **$0.00**. `computeCommercialKpis` excludes them by owner address
(case/whitespace-insensitive) and by the ≤$2 smoke-test amount, and reports the
excluded count on the card.

Regression locks added in `src/test/commercial-kpi.test.ts`:
- owner addresses match regardless of case or padding
- exact production snapshot must yield 0 orders / $0.00 / AOV null / 5 excluded
- a genuine $2.01 order is **not** excluded (boundary is not over-broad)

## 2. Hero supplier evidence (EXTERNAL_APPROVAL)

Internal sources re-checked, nothing new exists: `supplier_products`,
`cj_us_winners` and `product_supplier_mappings` are empty; `cj_sync_items`
holds only low-confidence CN shipping rows that contradict the verified US
warehouse. Evidence tables stand as in Phase 8/9:

- Hero 3 — VERIFIED full spec block (dimensions, polypropylene, <10 lb cat, contents, no assembly).
- Hero 1 — CONFLICT on shipped weight (4.4 lb variant payload vs 5.5 lb product record); not displayed.
- Heroes 2 / 4 / 5 — packed dimensions + US origin VERIFIED; assembled size, materials, weight limits, cleaning and certification UNKNOWN and omitted from PDPs.

Nothing inferred. The three spec request packets in
`docs/commercial-rebuild/phase9/SUPPLIER-SPEC-PACKETS.md` remain **unsent**.

## 3. Unsupported-claim sweep (COMPLETE)

Removed this phase from live, indexable copy:

- **Fabricated star ratings** on buying-guide roundups (`SeoTrafficPage`,
  `SeoClusterPage`): the rating column and the two card rating rows no longer
  render, so the invented 4.4–4.9 figures in the guide data reach no page.
- **Popularity/rank badges** — `neutralBadge()` rewrites "Most Popular",
  "Best Seller" and "#1 …" before render (we hold no sales or popularity data).
- **In-house testing claims** across ~15 guide/SEO/config files, including
  "professional air quality monitors and human panel sniff tests",
  "tested with real large-breed cats", "We compared toys with real cats",
  "Our testing methodology", and the generator prompt in `dominance-engine.ts`.
  Replaced with published-specification wording, consistent with the
  "how we select products" page.

Preserved: factual supplier-provided specs, general safety/care education, and
the merchant-approved shipping/return policy line.

Locked by `src/test/phase10-claims.test.ts` (source-wide scan + badge + rating).

## 4. Catalog truth (COMPLETE)

All 68 sellable products: effective stock > 0, price > 0, US warehouse — zero
exceptions. Checkout remains the authority: `resolveExactVariant` +
`variantIsPurchasable` fail closed with `variant_unavailable` /
`variant_required`, price recomputed server-side from the exact variant, and no
substitution or warehouse swap is possible.

## 5. Owned-growth systems (READY, DISABLED)

Review-request email: delivered-orders only, unsubscribe link plus
`newsletter_subscribers` suppression, idempotency key per order+product,
links to the product review anchor with the order id so a verified-buyer
badge can be earned. Sending stays behind `REVIEW_REQUEST_EMAILS_ENABLED`
(off). All other outbound email functions also stop before the mail provider.
Placeholder reviews remain unapproved and excluded from every rating.

## Remaining EXTERNAL_APPROVAL items

1. Send the three supplier spec requests (unblocks hero specs and, possibly, delivery windows).
2. Switch on genuine review-request emails.
3. Any paid acquisition spend.

No internal work is blocked on the user.

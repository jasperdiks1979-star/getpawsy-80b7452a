# Phase 8 — Evidence completion + final commercial hardening (closure report)

Date: 2026-09-16. Published to https://getpawsy.pet. No payment, refund, supplier order,
customer email or external publication was performed.

## Defects found and fixed

1. **False automatic-litter-box claims on every litter box PDP.** `ProductDetail` gated the
   `LitterBoxConversionBoost` and `LitterBoxLovedSection` blocks on any product whose name or
   category contained "litter box". Those blocks state "self-cleans after every visit",
   "sensor-triggered cycle", "anti-tip base, safety sensors", "control and monitor from the
   GetPawsy companion app" and an "App control" chip. **No stocked product is automatic** — all
   20 visible litter products are manual. The blocks are now gated on
   `isAutomaticLitterBoxProduct` (title must document self-cleaning/automatic/robot operation),
   so they render for nothing in the current range. Same gate applied to the TikTok litter-box hero.
2. **Fabricated rating on the TikTok PDP layout.** `StarRating count={reviewCount || 247}` with a
   `4.8` average fallback. Removed: the rating row renders only when approved reviews exist.
3. **Unsupported popularity claim.** "Popular this week" chip removed.
4. **Inaccurate review footer.** "All reviews are from verified purchases" replaced with
   "Published after moderation · Only reviews matched to a paid order show a verified-purchase badge".

Regression cover: `src/test/litterbox-claims.test.ts` (3 tests) blocks all four from returning.

## Evidence closure (priority 1)

`docs/commercial-rebuild/phase8/EVIDENCE-MATRIX.md` — per-hero VERIFIED / CONFLICT / UNKNOWN table
with source and date, produced by `buildProductEvidence()` from read-only sources. All candidate
sources exhausted: `supplier_products`, `cj_us_winners` and `product_supplier_mappings` are empty;
`cj_sync_items` holds only inventory/shipping events; `cj_media_asset_registry` holds media only.

- New evidence recovered: packed carton dimensions and shipping weight for all five heroes, plus
  exact variant identities and verified US inventory — already surfaced, correctly labelled as
  packed (not product) dimensions.
- Hero 1 shipping weight is a CONFLICT (4.4 lb variant payload vs 5.5 lb product record) → not shown.
- Assembled dimensions, materials, capacity, cleaning and compliance remain UNKNOWN for four heroes.
- Supplier specification requests are drafted in the matrix document. **Not sent.**

## Delivery truth (priority 2)

`docs/commercial-rebuild/phase8/DELIVERY-DATA-CONTRACT.md`. No trustworthy lane-level evidence
exists: the only shipping record found (`cj_sync_items.shipping_synced`, hero 1) is self-labelled
`confidence: low` and claims a CN warehouse that contradicts the verified US inventory. ETA claims
stay off; the document defines the exact record and six display gates required before any window
may ever render. The AI-written "Estimated delivery: 5–10 business days" text in
`products.optimized_description` is not rendered anywhere on the storefront (verified by code search).

## Reviews (priority 3)

- 72 placeholder reviews: `is_approved=false`, `is_verified_buyer=false`; RLS exposes only
  `is_approved=true OR own row`; both rating hooks filter on `is_approved=true`. No rating or count
  can render from them.
- Verified-buyer flag is server-enforced by the `trg_product_reviews_guard` trigger via
  `review_order_is_eligible(order_id, user_id, product_id)`; non-admins cannot set approval or order id.
- `send-review-request` remains gated by `REVIEW_REQUEST_EMAILS_ENABLED`; all five customer-email
  functions remain fail-closed on `OUTBOUND_CUSTOMER_EMAIL_ENABLED`.

## QA and release (priority 4)

- 1036 tests pass (1 skipped), typecheck clean, build OK.
- Security scan: 0 critical, 0 error; 3 pre-existing warnings previously ignored by the user.
- KPI reconciliation against `orders`: 5 paid / $219.98 / AOV $44.00 / 0 refunded — matches the dashboard.
- Production smoke after publish: `/`, `/shop`, `/bundles`, `/cart`, `/track-order`, `/sitemap.xml`,
  `/collections/cat-litter-boxes` and three hero PDPs all 200.

## Remaining work that cannot be done internally

| Blocker | Why internal sources cannot solve it |
| --- | --- |
| Assembled dimensions, materials, capacity, cleaning, compliance for 4 heroes | Catalogue holds supplier marketing prose only; no spec sheet exists in any table |
| Hero 1 weight conflict (4.4 vs 5.5 lb) | Two internal sources disagree; only the supplier can arbitrate |
| Any delivery window | No carrier or supplier SLA data connected; fewer than 30 delivered orders to measure |
| Genuine reviews | Requires real customers and an enabled review-request email |

## Next actions requiring explicit user approval

1. Enable genuine review-request emails (`REVIEW_REQUEST_EMAILS_ENABLED` +
   `OUTBOUND_CUSTOMER_EMAIL_ENABLED`) — sends real mail to real customers.
2. Send the drafted supplier specification requests to CJ.
3. Any paid acquisition (plan ready in `docs/commercial-rebuild/phase7/ACQUISITION-PLAN.md`).
4. Connecting a carrier/supplier SLA feed so delivery windows can be displayed.

# Phase 4 — evidence, sets, reviews

## A. Hero PDP evidence closure

`src/lib/product-evidence.ts` classifies every specification field as
VERIFIED / CONFLICT / UNKNOWN from the two sources that actually exist: the
supplier variant payload stored on the product record, and the supplier's own
"Label: value" specification block inside the description. Nothing is inferred
and no supplier was contacted.

`src/components/product/VerifiedSpecs.tsx` renders only VERIFIED rows on the
PDP and names what is *not* documented, instead of filling the gap. The
invented "premium materials" list and the generic dog-harness size chart that
was showing on cat products were removed.

Per-hero tables: `HERO-EVIDENCE.md`. Summary: origin, packed dimensions,
shipping weight and option identities are verified for all five heroes; product
dimensions, materials, included items, assembly and cleaning are documented for
two of the five and are stated as undocumented on the other three. One hero has
a shipping-weight CONFLICT (supplier payload 4.4 lb vs product record 5.5 lb);
neither figure is published.

## B. Bundles — option chooser (`/bundles`)

`src/lib/bundles.ts` + `src/components/bundles/BundleCard.tsx`:

- every component with more than one purchasable option requires an explicit
  choice; there is no first-variant fallback anywhere in the code path;
- a component with exactly one purchasable option auto-selects it;
- sold-out options render disabled and cannot be chosen;
- each component enters the cart as its own `${productId}-${vid}` line, so
  `create-checkout` re-validates identity, stock and price per line;
- **no discount.** The server prices every line at the canonical variant price,
  so a bundle discount could not be honoured. Sets are sold as convenience and
  no saving is claimed — a test asserts the copy makes no savings claim.

Five sets activate against the live catalogue (all CJ Dropshipping, US
warehouse, in stock): New Cat Starter Set, Vertical Territory, Scratch-Free
Living Room, Multi-Cat Litter, Feeding & Play Corner. A set that fails any gate
is not rendered at all. 18 regression tests in `src/test/bundles.test.ts`.

### Revenue bug found while gating

45 supplier variants across **38 of the 68 merchandised products** carry
`stock: 0` on the flat field while their US warehouse record shows hundreds of
units (`verifiedWarehouse: 1`). `variantStockOf` read the flat field, so
checkout failed those lines closed as `variant_sold_out` — real, in-stock
products could not be bought.

Fix: `variantWarehouseStockOf` (server, `_shared/order-state.ts`) and
`variantWarehouseStock` (client, `quickAdd.ts`) prefer the supplier's
per-warehouse inventory and fall back to the flat field only when no warehouse
record exists. Fail-closed behaviour is unchanged where there is no evidence.

## C. Replenishment

`REFILL-AUDIT.md` — **NO_VALID_REFILL_LAYER**. The merchandised range is
entirely durable hardware; no consumable exists in the catalogue. Subscriptions
stay off.

## D. Reviews

- `product_reviews.order_id` added. A database trigger recomputes
  `is_verified_buyer` from that order every time — true only when the order is
  paid, owned by the reviewer, and contains that product. The client cannot set
  the flag.
- New reviews are forced unapproved; only admins can publish, edit or delete
  someone else's review.
- Public star ratings and counts now read approved reviews only, so the 72
  unapproved placeholder reviews cannot influence any average.
- The review-request email function is gated behind
  `REVIEW_REQUEST_EMAILS_ENABLED=true`. It is not set, so no customer email can
  be sent. Deployed in the disabled state, awaiting explicit permission.

## E. Merchandising

`/bundles` linked from the main navigation ("Sets"), the footer and the pages
sitemap. The 244-product protected legacy layer is untouched and still
indexable.

## F. Verification

Typecheck clean, build OK, 1017 tests pass. Six order-path edge functions
redeployed with the corrected stock rule. No payment, refund, supplier order,
customer email or advertising action was taken.

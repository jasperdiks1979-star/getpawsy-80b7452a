# Phase 8 — Hero evidence matrix

Generated from read-only internal sources on 2026-09-16 by `buildProductEvidence()`
(`src/lib/product-evidence.ts`) over `products_detail`.

Sources exhausted (all read-only, no external contact):
- `products` row fields (description, weight, supplier_warehouse, variants, shipping_time, optimized_description)
- `products.variants` supplier payload (variantStandard / variantWeight / inventories / vid / sku)
- `cj_sync_items` history (per-product sync events, incl. shipping + inventory)
- `supplier_products` (0 rows), `cj_us_winners` (0 rows), `product_supplier_mappings` (0 rows) — empty, no evidence
- `cj_media_asset_registry` (media only, no specifications)
- repo docs under `docs/commercial-rebuild/`

Confidence rule: VERIFIED = one source states it and no other source contradicts it.
CONFLICT = two sources differ (never displayed). UNKNOWN = no source states it (claim omitted).

## Enclosed Cat Litter Box – Dual Opening Anti-Splash Odor-Locking for Cats

`/products/front-flip-door-dual-opening-anti-splashing-anti-tracking-odor-locking-cat-e265`

| Field | Status | Value | Source |
| --- | --- | --- | --- |
| Product dimensions | UNKNOWN | — | — |
| Packed dimensions | VERIFIED | 21 x 15 x 5.5 in | supplier variant payload |
| Shipping weight | CONFLICT | 4.4 lb vs 5.5 lb | supplier variant payload vs product record |
| Materials | UNKNOWN | — | — |
| Suitable for | UNKNOWN | — | — |
| In the box | UNKNOWN | — | — |
| Assembly | UNKNOWN | — | — |
| Cleaning | UNKNOWN | — | — |
| Options | VERIFIED | White | supplier variant payload |
| Ships from | VERIFIED | a United States warehouse | supplier warehouse field + verified US inventory record |
| Compliance / safety | UNKNOWN | — | — |

## 54 -Cat Tree Tower - Multi-level With Sisal Grab Post, Indoor Apartment With Ladder, Plush Toys, Rest And Play

`/products/54-cat-tree-tower-multi-level-with-sisal-grab-post-indoor-apartment-with-ladder-plush-toys-rest-and-`

| Field | Status | Value | Source |
| --- | --- | --- | --- |
| Product dimensions | UNKNOWN | — | — |
| Packed dimensions | VERIFIED | 20 x 8.5 x 20.5 in | supplier variant payload |
| Shipping weight | VERIFIED | 32.4 lb | supplier variant payload |
| Materials | UNKNOWN | — | — |
| Suitable for | UNKNOWN | — | — |
| In the box | UNKNOWN | — | — |
| Assembly | UNKNOWN | — | — |
| Cleaning | UNKNOWN | — | — |
| Options | VERIFIED | Light grey, Pink | supplier variant payload |
| Ships from | VERIFIED | a United States warehouse | supplier warehouse field + verified US inventory record |
| Compliance / safety | UNKNOWN | — | — |

##  Covered Cat Litter Box with Lid, Drawer, Scoop, Top Entry, Deodorizing Bags, Odor Control, Easy to Clean, Gray

`/products/covered-cat-litter-box-with-lid-drawer-scoop-top-entry-deodorizing-bags-odor-control-easy-to-clean-g`

| Field | Status | Value | Source |
| --- | --- | --- | --- |
| Product dimensions | VERIFIED | 15.9" W x 20.7" D x 16.7" H | supplier specification block |
| Packed dimensions | VERIFIED | 20.5 x 7.1 x 16.1 in | supplier variant payload |
| Shipping weight | VERIFIED | 5.8 lb | supplier variant payload |
| Materials | VERIFIED | Polypropylene | supplier specification block |
| Suitable for | VERIFIED | Suitable for cats under 10 lbs | supplier specification block |
| In the box | VERIFIED | 1 x Cat Litter Box, 1 x Scoop, 2 x Deodorizing Bags, 1 x Manual | supplier specification block |
| Assembly | VERIFIED | No assembly required | supplier specification block |
| Cleaning | UNKNOWN | — | — |
| Options | VERIFIED | Gray-410x180x520 mm | supplier variant payload |
| Ships from | VERIFIED | a United States warehouse | supplier warehouse field + verified US inventory record |
| Compliance / safety | UNKNOWN | — | — |

## Interactive Cat Puzzle Toy – Treat Dispensing Ball & Spring Wand for Enrichment

`/products/cat-puzzle-toy-with-ball-and-spring-loaded-wand-felt-indoor-cat-toy-box-suction-84be`

| Field | Status | Value | Source |
| --- | --- | --- | --- |
| Product dimensions | UNKNOWN | — | — |
| Packed dimensions | VERIFIED | 12.2 x 3.5 x 12.6 in | supplier variant payload |
| Shipping weight | VERIFIED | 0.7 lb | supplier variant payload |
| Materials | UNKNOWN | — | — |
| Suitable for | UNKNOWN | — | — |
| In the box | UNKNOWN | — | — |
| Assembly | UNKNOWN | — | — |
| Cleaning | UNKNOWN | — | — |
| Options | VERIFIED | Yellow, Green | supplier variant payload |
| Ships from | VERIFIED | a United States warehouse | supplier warehouse field + verified US inventory record |
| Compliance / safety | UNKNOWN | — | — |

## Stainless Steel Cat Litter Box With Lid, Large Cat Litter Box For Big Cats, Scoop And Mat Included

`/products/stainless-steel-cat-litter-box-with-lid-large-cat-litter-box-for-big-cats-scoop-and-mat-included`

| Field | Status | Value | Source |
| --- | --- | --- | --- |
| Product dimensions | UNKNOWN | — | — |
| Packed dimensions | VERIFIED | 24.2 x 7.5 x 16.3 in | supplier variant payload |
| Shipping weight | VERIFIED | 7.5 lb | supplier variant payload |
| Materials | UNKNOWN | — | — |
| Suitable for | UNKNOWN | — | — |
| In the box | UNKNOWN | — | — |
| Assembly | UNKNOWN | — | — |
| Cleaning | UNKNOWN | — | — |
| Options | VERIFIED | Black, Dark grey, Light grey | supplier variant payload |
| Ships from | VERIFIED | a United States warehouse | supplier warehouse field + verified US inventory record |
| Compliance / safety | UNKNOWN | — | — |


## Findings

- Product (assembled) dimensions exist only for hero 3 (covered top-entry box). Heroes 1, 2, 4, 5 have
  packed-carton dimensions only; these are labelled "Packed dimensions" and never presented as product size.
- Hero 1 (`front-flip-door…e265`) has a shipping-weight CONFLICT: variant payload 4.4 lb vs product record 5.5 lb.
  No weight is displayed for that product until one source is corrected by the supplier.
- Materials, weight capacity, cleaning instructions and compliance/safety are UNKNOWN for four of five heroes.
  These cannot be resolved internally — the catalogue holds supplier marketing prose, not a specification sheet.

## Prepared supplier requests (DRAFTED, NOT SENT)

No message was sent. Sending requires explicit user approval.

Recipient: CJ Dropshipping product support, per product ID.

> Subject: Specification sheet request — product {CJ_PRODUCT_ID}
>
> We list this product in the United States and publish only manufacturer-documented
> specifications. Please supply, for product {CJ_PRODUCT_ID} ({PRODUCT_NAME}):
> 1. Assembled product dimensions (L x W x H, with unit)
> 2. Material composition of each major part
> 3. Maximum supported pet weight / capacity
> 4. Assembly requirement and tool list
> 5. Cleaning and care instructions
> 6. Exact contents of the package
> 7. Any safety or compliance certification (and certificate number)
> 8. Net product weight, to resolve the 4.4 lb / 5.5 lb discrepancy on {CJ_PRODUCT_ID=2022147992715550722}

Product IDs: 2022147992715550722 (hero 1), 1993160057093906434 (hero 4),
1976569563728994306 (hero 5), plus the cat tree hero for materials/capacity.

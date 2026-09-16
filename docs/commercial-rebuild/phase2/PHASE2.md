# Phase 2 — cat-first assortment applied to production (reversible)

Executed 2026-09-16. Every change is recorded row-by-row in
`public.commercial_rebuild_ledger` with the previous value, so any batch can be
rolled back with a single update. **No product record was deleted.**

## Mechanism

| Field on `products` | Meaning |
| --- | --- |
| `merch_role` | hero / core / accessory / longtail / legacy / blocked / retired |
| `merch_hidden` | excluded from shop listings, search, rails and recommendations |
| `seo_noindex` | page renders `noindex, follow` and is dropped from the sitemap |
| `merch_rank` | display order inside a role |

`products_shop` is a new view = `merch_hidden = false AND is_active = true`.
All storefront listing surfaces read it. Product **pages** still read
`products_detail`, so every existing URL — retired ones included — keeps
resolving. Nothing 404s.

## Batches

| Batch | Products | Action |
| --- | --- | --- |
| batch1_zero_traffic_retire | 409 | out of range, **zero human visits in 90 days**, no orders, no bundle dependency → hidden + noindex |
| batch2_legacy_layer | 244 | out of range but real traffic / past orders / bundle links → **kept live and indexable**, removed from primary merchandising only |
| batch3_assortment_roles | 121 | 5 hero, 38 core, 9 accessory, 20 longtail, 49 blocked |
| batch4_duplicate_resolution | 60 | non-keeper duplicates pointed at their cluster keeper and de-merchandised |

Protection gate used before batch 1 (all three had to be false):
human visit in the last 90 days (bot- and internal-filtered), any order
containing the product id, membership of an active bundle. 244 of the 653
out-of-range products tripped the gate and were routed to the legacy layer
instead of being retired — including 22 the earlier report had listed as
zero-traffic. Live traffic data overruled the report.

## Result

| Role | Count | Visible in shop | De-indexed |
| --- | --- | --- | --- |
| hero | 5 | yes | no |
| core | 38 | yes | no |
| accessory | 9 | yes | no |
| longtail | 20 | yes | no |
| blocked | 49 | no | no |
| legacy | 244 | no | no (URLs preserved) |
| retired | 409 | no | yes |

72 products are visible in the shop window; the dog / non-cat range survives as
a protected legacy layer that is reachable and indexable but absent from
cat-first navigation.

## Redirects

`public.product_redirects` exists (source, target, reason, confidence) but is
**empty on purpose**. No redirect was created: the low-traffic out-of-range
pages are dog and outdoor products with no strong 1:1 cat equivalent, and
mass-redirecting them to unrelated pages would destroy more than it saves. They
stay accessible and de-emphasised instead.

## Not yet done

- Delivery-window evidence is still absent for the whole catalog, so no ETA is
  shown anywhere; shipping copy stays at the existing neutral wording.
- Bundles remain proposals only — none activated.
- PDP rebuild, homepage re-merchandising, lifecycle/review infrastructure and
  the KPI cockpit are follow-up work.

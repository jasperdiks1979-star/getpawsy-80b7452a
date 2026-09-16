# Scoring model and hard gates

Implemented in `scripts/commercial-rebuild-audit.mjs`. Every component is written to the
CSV/JSON as `s_<component>` so the 100-point total can be re-derived by hand.

## Source export (read-only)

```sql
-- psql -At -o /tmp/audit/products.json -c "... json_agg(x) ..."
-- products LEFT JOIN 90-day canonical_events aggregates (views, add-to-cart)
--          LEFT JOIN paid/completed/fulfilled orders.items aggregates (units, revenue)
```

## Components (max 100)

| Component | Max | Rule | Evidence or inference |
| --- | --- | --- | --- |
| margin | 15 | `(price − landed_cost/cost_price)/price`: ≥70%→15, ≥60%→13, ≥50%→11, ≥40%→8, ≥30%→5, ≥20%→2, else 0; unknown cost → 0 | Evidence (DB cost) |
| us_stock | 15 | us≥20→15, us>0→12, eu>0→7, cn>0→5, other effective stock→4, none→0; if columns are 0 but the CJ variant payload reports US units → 6 with a re-sync note | Evidence |
| shipping | 10 | US warehouse + fast→10, US stock→8, max ≤12d→6, ≤20d→4, else 2 | Mixed — `shipping_days_*` is empty catalog-wide, so almost all land on the conservative floor |
| problem | 10 | 3 pts per matched problem keyword (odor, tracking, splash, scratch, hair, self-clean, orthopedic, …), capped | Inference from title/description |
| differentiation | 10 | 3 pts per differentiator keyword (flip, dual, modular, enclosed, hidden, sensor, …) + 1 if not a duplicate | Inference |
| spec | 10 | up to 6 from `quality_score`/`content_readiness_score`, plus 0–4 from description length | Evidence + inference |
| visual | 8 | ≥6 images→8, ≥4→6, ≥2→4, primary only→2, none→0 | Evidence |
| ugc | 7 | 7 for visually social categories (tree, condo, litter, house, bed, window, cave, wheel), else 4 if ≥4 images, else 2 | Inference |
| bundle | 5 | 5 if the product sits in a natural bundle family (litter, mat, scoop, bowl, toy, brush, bed), else 2 | Inference |
| return_risk | 5 | starts at 5; −3 fragile materials, −2 if >15 kg (−1 if >8 kg), −1 if weight unknown | Mixed |
| supplier | 5 | +2 CJ mapping, +1 supplier status active, +2 inventory synced ≤7d (+1 ≤30d) | Evidence |

## Hard gates

`NO_SUPPLIER_MAPPING`, `UNRELIABLE_SUPPLIER` (supplier discontinued), `INVALID_VARIANT_MAPPING`,
`NO_REAL_STOCK`, `NO_US_DELIVERY_PATH`, `UNKNOWN_WAREHOUSE`, `UNUSABLE_SHIPPING_PROMISE`,
`INSUFFICIENT_SPECS` (<250 chars of copy), `UNACCEPTABLE_MARGIN` (<35%), `MARGIN_UNKNOWN`,
`DUPLICATE`, `ADMIN_REVIEW:<reason>`, `MISSING_IMAGERY`, `INVENTORY_BLOCKED`.

`UNUSABLE_SHIPPING_PROMISE` fires on **100%** of the catalog because `shipping_days_min/max` is
unpopulated everywhere. It is a systemic data gap, not a per-product defect, so it is recorded on
each row but excluded from the per-product `blocking_gates` count. `MARGIN_UNKNOWN` is likewise
informational (it affects only 1 product).

## Role assignment (preliminary, nothing mutated)

- `RETIRE_CANDIDATE` — ≥3 blocking gates, or no stock anywhere, or total < 45.
- `HERO_CANDIDATE` — total ≥ 72, zero blocking gates, US stock > 0, species = cat.
- `CORE_CANDIDATE` — total ≥ 60 with ≤1 blocking gate.
- `ACCESSORY_CANDIDATE` — total ≥ 48 and price < $40.
- `LONGTAIL` — total ≥ 45.

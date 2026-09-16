# Phase 8 — Delivery truth: evidence audit + data contract

## What exists today (read-only audit, 2026-09-16)

| Source | Content | Verdict |
| --- | --- | --- |
| `products.shipping_time` | Free text, mixed provenance, e.g. "10–20 days" on US-warehouse items | Untrustworthy — never displayed |
| `products.optimized_description` | AI copy containing "Estimated delivery: 5–10 business days" | Not rendered anywhere on the storefront (confirmed by code search); must stay unrendered |
| `cj_sync_items` `shipping_synced` events | `{daysMin: 8, daysMax: 15, warehouse: "CN", confidence: "low"}` for hero 1 | Self-declared low confidence AND contradicts the verified US warehouse record. Unusable |
| `supplier_products`, `cj_us_winners` | 0 rows | No evidence |
| Carrier / lane data | None connected | Absent |

Conclusion: **no trustworthy lane-level shipping evidence exists.** ETA claims stay off.
`src/lib/delivery-truth.ts` remains the single decision point: proven US origin is stated as a
fact, transit speed is never claimed.

## Minimum data contract required before any delivery window may be displayed

A delivery window may only render when a record satisfies every clause:

```
DeliveryEvidence {
  product_id            uuid      -- exact product, not a category default
  variant_id            text      -- exact purchasable variant
  origin_warehouse_code text      -- must match the warehouse that will actually ship
  destination_scope     text      -- 'US' or a ZIP/state lane, never "worldwide"
  carrier_service       text      -- named service the estimate belongs to
  transit_days_min      int       -- carrier-stated, excludes handling
  transit_days_max      int
  handling_days_max     int       -- supplier-stated dispatch time
  measured_p50_days     int|null  -- from our own delivered orders, when >= 30 exist
  evidence_source       text      -- 'carrier_api' | 'supplier_sla_document' | 'own_delivered_orders'
  observed_at           timestamptz
  confidence            text      -- only 'high' may render
}
```

Display gates (all must pass):
1. `evidence_source` is one of the three allowed values — never an AI or inferred value.
2. `confidence = 'high'`.
3. `observed_at` is under 30 days old.
4. `origin_warehouse_code` matches the variant's verified inventory warehouse.
5. No conflicting record exists for the same product/variant/lane.
6. Displayed text = `handling_days_max + transit_days_min` to `handling_days_max + transit_days_max`
   business days, labelled as an estimate, with the origin stated separately as a fact.

If any gate fails, the storefront shows origin only and no speed claim — the behaviour live today.
Nothing here is implemented as a table yet: creating it before real evidence exists would only
invite a synthetic fill.

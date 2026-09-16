# Phase 4 C — replenishment / subscription feasibility

**Conclusion: NO_VALID_REFILL_LAYER. Subscriptions stay off.**

## What was audited

The whole 774-product catalogue, including retired and protected legacy items,
was searched for anything a cat household buys again: liners, filters,
replacement scratch surfaces, deodorisers, wipes, litter, catnip, refill
cartridges, scoops, mats and similar consumables.

## What the catalogue actually holds

Every candidate fails at least one hard gate:

| Candidate group | Blocking fact |
| --- | --- |
| Litter mats, scoops, deodorising bags | Only exist as items already included in the litter boxes; not sold separately. |
| Grooming brushes / hair removers | Ship from a CN warehouse, so they cannot join a US set and are durable, not consumable. |
| Fountain filters | The water fountains they belong to are dog/legacy products that are out of the merchandised range; no filter SKU exists on its own. |
| Paw balm, wipes, treats | Legacy non-cat items, out of stock or discontinued supplier. |
| Litter itself | Not in the catalogue at all — no supplier line for it. |

The merchandised cat range is entirely durable hardware: litter boxes, cat
trees, steps, bowls and toys. A cat tree is bought once. There is no product in
the catalogue that a customer has a truthful reason to re-order on a schedule.

## Decision

- No subscription, auto-ship or "refill" plan is offered. Offering one would
  mean charging repeatedly for durable goods.
- No replenishment reminders are sent.
- Repeat purchase is supported honestly instead, through the curated sets
  (`/bundles`) and second-box merchandising for multi-cat homes, both of which
  are one-off purchases at normal prices.

Revisit only if a genuine consumable line (litter, liners, filters, refill
toys) is sourced with US stock and verified margin.

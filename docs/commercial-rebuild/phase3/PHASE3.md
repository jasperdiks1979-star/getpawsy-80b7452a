# Phase 3 — truth, trust and merchandising

## 0. Critical security finding (closed)

`products_public` was a SECURITY DEFINER view over `products` with **no WHERE
clause**. The anonymous storefront key could therefore read all 774 product
rows — inactive, retired and duplicate items included, plus internal fields
(`supplier_name`, `cj_product_id`, `supplier_warehouse`, `stock_source`) —
bypassing the table's row level security entirely.

Verified before the fix: anon `count(products_public) = 774`, and
`?is_active=eq.false` returned rows. After
`ALTER VIEW public.products_public SET (security_invoker = on)`: anon count is
**321**, identical to `products_detail`, and no inactive rows are returned.
The linter's Security Definer View error is gone.

Regression coverage: `src/test/public-catalog-boundary.test.ts` asserts that
every shopper-facing catalog view is invoker-mode in migration order, that no
later migration flips it back, and that no shopper role is ever granted write
privileges on those views.

Side effect found by the fix: 4 merchandised products had zero stock and were
therefore invisible to shoppers anyway. They are now `blocked`
(batch5_out_of_stock_block, reversible) so the range matches reality — 68
products visible.

## 1. Delivery truth

No authoritative delivery data exists. The `shipping_time` column has mixed
provenance — some values come from supplier files, some from hardcoded
importer defaults (`'2-5 business days'` in import-supplier-csv), some are
legacy cross-border defaults — and 34 of the merchandised products carry
"10-20 business days" while shipping from a US warehouse. It is not
trustworthy and is **not displayed anywhere** on the storefront.

The one evidenced per-product delivery fact is the fulfilment origin
(`supplier_warehouse`): 64 of 68 merchandised products are US, 3 unknown, 1 CN.

`src/lib/delivery-truth.ts` is the single decision point:

| Evidence | What the shopper is told |
| --- | --- |
| US warehouse proven | Origin stated as fact; transit stated as an **estimate**; exact option confirmed at checkout |
| Origin unproven | No speed claim at all — processing time only, delivery confirmed at checkout |

No ETA was invented and no existing promise was strengthened. No background
job was added.

## 2. Bundles — deliberately NOT activated

Bundle activation fails its own safety gate. The cart requires an explicit
purchasable variant per line (`src/lib/quickAdd.ts`, enforced server-side by
`create-checkout`'s `resolveExactVariant`). Bundle components are
multi-variant products, so a bundle could only be added to the cart by
silently choosing a variant for the shopper — exactly the substitution the
brief forbids. `product_bundles` stays empty. Unblocking this needs a variant
chooser inside the bundle add flow; that is a build, not a data decision.

## 3. Trust and review integrity

Removed, all reversible or replaceable:

- **72 fabricated reviews** were live and flagged `is_verified_buyer = true`.
  Every one was written under the placeholder account
  `00000000-0000-0000-0000-000000000001`, several share identical text under
  different names, and none maps to an order. Unapproved (not deleted) and
  logged as batch6_fake_review_removal.
- **Invented testimonials at checkout** (`CheckoutSocialProof`) — replaced by
  four checkable policy facts.
- **Invented testimonials + hardcoded 4.8 rating** in the hero trust strip.
- **Invented testimonials and a fabricated "Charlie's story"** on the
  orthopedic dog bed collection page.
- **12 invented customer counts** ("10,000+ pet parents", "thousands of US pet
  families", "Join 5,000+ dog owners", "Loved by 500+ dog owners", …).
- **Fabricated ranking methodology** on Bestsellers ("verified purchase data
  from thousands of US pet parents", a weighted scoring model that does not
  exist, "reduces maintenance by 80%").
- Dead component `RecentOrdersSection` containing five invented orders.

`src/test/trust-claims.test.ts` fails the build if any of these patterns
returns to shopper-facing code.

## 4. Homepage and category merchandising

- Category tiles are now cat-first and map to categories that actually hold
  merchandised products; dog tiles left primary navigation (URLs untouched).
- "Shop by problem" replaces a generic paragraph: six real indoor-cat problems
  linking to the matching category.
- Title and meta description rewritten cat-first; "Trusted by US pet owners"
  removed.

## 5. Commercial KPI cockpit

Extended the existing `/admin/clean-kpi` dashboard rather than adding another
one. New card: paid orders, revenue, AOV, refund rate, repeat purchase rate,
margin. One bounded read of `orders` for the selected window — no history
scan, no new job. Rates are suppressed below 10 paid orders and labelled "not
enough data"; margin is labelled "not available" because no verified per-order
cost is recorded.

## 6. Retention / replenishment — not applicable on current evidence

The merchandised range is entirely durable hardware: litter boxes, trees,
toys, beds, bowls. There are no refills, filters, liners or consumables, so
there is nothing to replenish and no subscription economics to prove. The
honest path is accessory attach (mats, scoops, liners) — which requires
sourcing products we do not currently stock. No subscription infrastructure
was built.

## Still open

- **Hero/core PDP copy rebuild.** Needs a verified spec source. The catalog
  holds supplier marketing text, not documented dimensions, materials, weight
  limits or assembly steps for most products. Writing those sections today
  would mean inventing them.
- **Bundles**, blocked as described above.
- **Content/internal linking** beyond the trust cleanup already done.

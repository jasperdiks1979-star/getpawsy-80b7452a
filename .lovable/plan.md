# Item 14 — Multi-Warehouse Inventory Engine

Adds US / EU / CN warehouse awareness across availability, PDP, Pinterest, GMC feed, and analytics. Prevents revenue loss by keeping CN-fallback products purchasable instead of marking them sold out.

## 1. Data model

Migration on `public.products` (additive, nullable):
- `us_stock int`
- `eu_stock int`
- `cn_stock int`
- `primary_warehouse text` — computed: `US` | `EU` | `CN` | `NONE`
- `fallback_active boolean` — true when US=0 but CN/EU>0

Backfill from existing CJ variant data (`variants[].inventory` per warehouse code) via one-shot script. Existing `stock` column stays as the legacy aggregate (= us+eu+cn) for backwards compatibility.

New table `public.warehouse_revenue_log`:
- product_id, event ('us_only_sale' | 'cn_fallback_sale' | 'eu_fallback_sale' | 'missed_sold_out')
- order_id, amount, occurred_at
- Service-role write; admin read.

## 2. Shared resolver

`src/lib/warehouse-availability.ts` — single source of truth:

```ts
resolveWarehouse(product) -> {
  status: 'in_stock_us' | 'cn_fallback' | 'eu_fallback' | 'sold_out',
  label: 'In Stock' | 'Available' | 'Sold Out',
  shippingLabel: 'Fast US Shipping' | 'Ships From Overseas' | null,
  estimatedDelivery: '3-7 business days' | '7-15 business days' | null,
  pinterestEligible: boolean,
  source: 'US' | 'EU' | 'CN' | 'NONE',
}
```

Wire `computeAvailability` and `merchant-safe-product` to call it so PDPs, cards, JSON-LD, OG, and GMC feed all align.

Edge equivalent: `supabase/functions/_shared/warehouse-availability.ts` mirroring the same contract for server use.

## 3. Pinterest eligibility update

Extend `_shared/pinterest-eligibility.ts`:
- Replace `cj_zero` check with multi-warehouse: only block when US+EU+CN all = 0.
- Add `creative_meta.warehouse_source` so downstream copy can branch.

## 4. Pinterest copy injection (CN/EU fallback)

In `cinematic-ad-orchestrator` + `pinterest-video-publisher` + `pinterest-pin-creator`:
- When `warehouse_source === 'CN'`, append one of: "Available Again" / "Limited Stock" / "Worldwide Shipping" to overlay + description.
- Hard-ban any "Out Of Stock" string for fallback products (extend banned-phrases checker).

## 5. PDP / cards UI

- Update `ProductAvailability`, sticky CTA, and card badges to render the new label + shipping line from `resolveWarehouse`.
- `computeAvailability` still returns `isInStock` (true for US/CN/EU>0) so existing AddToCart, schema.org, and GMC feed mark CN-fallback as purchasable.
- Delivery estimate text on PDP swaps to "7-15 business days" for CN fallback.

## 6. GMC feed + SEO

- `getMerchantAvailability` returns "in stock" whenever any warehouse > 0.
- Shipping override per fallback: 7-15 days.
- Sitemap/SEO keeps these URLs live (no noindex injection for CN fallback).

## 7. Revenue recovery tracking

In post-payment orchestrator: when an order ships, log to `warehouse_revenue_log` with source warehouse. New edge `warehouse-missed-revenue-scan` (cron daily) estimates missed revenue from sessions that bounced on a sold-out PDP that had CN stock (uses `visitor_activity` + product snapshot).

## 8. Admin dashboard

Add panel on `/admin/pinterest-revenue-v4` (new `WarehouseInventoryPanel`):
- Products US only / CN fallback / EU fallback / fully sold out (counts)
- Missed revenue (sold-out without CN)
- Recovered revenue via CN fallback (last 30d)
- Buttons: refresh warehouse snapshot, run missed-revenue scan

Data via new edge `warehouse-inventory-dashboard` (JWT-gated, admin role).

## 9. Out of scope

- Real-time inventory pulls from CJ (uses existing sync job; this layer only consumes columns).
- Per-variant warehouse routing in checkout fulfillment.
- Splitting orders across warehouses.
- EU storefront (EU stock surfaced only as fallback — US remains primary audience).

## Files

Created:
- `src/lib/warehouse-availability.ts`
- `supabase/functions/_shared/warehouse-availability.ts`
- `supabase/functions/warehouse-inventory-dashboard/index.ts`
- `supabase/functions/warehouse-missed-revenue-scan/index.ts`
- `src/components/admin/WarehouseInventoryPanel.tsx`
- migration: products warehouse cols + `warehouse_revenue_log`

Edited:
- `src/lib/availability.ts`, `src/lib/merchant-safe-product.ts`
- `supabase/functions/_shared/pinterest-eligibility.ts`
- `cinematic-ad-orchestrator`, `pinterest-video-publisher`, `pinterest-pin-creator` (copy injection)
- `src/pages/admin/PinterestRevenueV4.tsx` (mount panel)
- `mem/marketing/pinterest-revenue-engine-v4.md`

Approve to implement, or tell me which sections to drop/adjust.

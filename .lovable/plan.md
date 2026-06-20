# Global Inventory & Revenue Engine V1

Builds on the existing Item 14 multi-warehouse foundation (`us_stock` / `eu_stock` / `cn_stock`, `resolveWarehouse`, `warehouse_revenue_log`, `WarehouseInventoryPanel`). This V1 closes the remaining gaps from the spec: a single `effective_stock` truth column, explicit `inventory_source` / `inventory_priority` / `inventory_score`, EU-warehouse copy + delivery, replacement candidates when fully sold out, and a one-shot global audit surfaced in the admin dashboard.

## 1. Data model (migration)

Additive on `public.products`:
- `us_available bool` — generated: `coalesce(us_stock,0) > 0`
- `eu_available bool` — generated: `coalesce(eu_stock,0) > 0`
- `cn_available bool` — generated: `coalesce(cn_stock,0) > 0`
- `effective_stock int` — generated: priority US → EU → CN (returns the first warehouse with stock, else 0)
- `inventory_source text` — generated: `'US' | 'EU' | 'CN' | 'NONE'`
- `inventory_priority int` — generated: 100 / 70 / 40 / 0
- `inventory_score int` — generated per spec (us>50 → 100; 20–50 → 90; 1–19 → 75; EU only → 60; CN only → 50; none → 0)

All columns are `STORED GENERATED` so they're automatically maintained whenever `us_stock` / `eu_stock` / `cn_stock` are written by the existing CJ sync. No backfill script needed.

New table `public.product_replacement_candidates`:
- `product_id`, `candidate_product_id`, `reason`, `match_score`, `created_at`
- service-role write; admin read.

## 2. Shared resolver upgrades

`src/lib/warehouse-availability.ts` + edge mirror:
- Add `inventoryScore` and `inventoryPriority` to the returned shape (mirror DB).
- Add EU branch already present — extend `fallbackCopyTags('EU')` to return `['EU Warehouse', 'Fast EU Shipping']`.
- Add helper `pickInventoryHook(source)` returning rotation of `['Back In Stock', 'Still Available', 'Limited Inventory', 'Worldwide Shipping']` for CN, EU-specific for EU, none for US.

`src/lib/availability.ts` already prefers warehouse columns; will switch to read `effective_stock` directly when present (cheaper, no client math).

## 3. Pinterest pipeline

- `_shared/pinterest-eligibility.ts` — replace any `us_stock`-only check with `effective_stock > 0`. Eligibility logs already include `warehouse_source`; add `inventory_priority` so queues can sort.
- `cinematic-ad-orchestrator`, `pinterest-video-publisher`, `pinterest-pin-creator` — when `inventory_source ∈ {CN, EU}`, inject one of the V1 hooks from `pickInventoryHook` into overlay + description. Keep the banned-phrase guard ("Out Of Stock", any reference to "China"/"shipped from China").
- Pin queue selector orders by `inventory_priority DESC` before existing scoring.

## 4. Google Merchant feed

`getMerchantAvailability` already returns "in stock" on any warehouse > 0. Add: feed builder emits delivery estimate per `inventory_source` (3-7 / 4-8 / 7-15 business days) via existing `shipping[*].handling_time` field.

## 5. PDP / cards UI

`ProductAvailability` + `WarehouseInventoryPanel` already render label + shipping line. Add:
- Inline badge component reading `inventory_source` for: "In Stock" + "Fast Shipping" (US), "EU Warehouse" (EU), "Available" + "Worldwide Shipping" (CN).
- Never render "Out Of Stock" when `effective_stock > 0` — enforced via central `getDisplayAvailability`.

## 6. SEO / collections

Sitemap + collection filters key off `effective_stock > 0` (not `us_stock`). Best-sellers / recommendations selector adds `inventory_priority` as a tie-breaker so US wins, EU/CN still ship.

## 7. Replacement engine

New edge `inventory-replacement-scan` (cron daily 04:00 UTC):
- For every product with `effective_stock = 0`, find up to 3 candidates: same `category`, price within ±20%, `effective_stock > 0`, ordered by `inventory_priority DESC`, then sales rank.
- Upsert into `product_replacement_candidates`. Consumed by Pinterest queue + best-sellers fallback.

## 8. Audit edge + dashboard

New edge `inventory-global-audit` (admin-gated JWT): returns one snapshot with
- counts: US-only / EU-only / CN-only / fully sold out / wrongly-marked sold out (legacy `stock=0` but `effective_stock>0`) / reactivatable
- estimated extra Pinterest-eligible products
- estimated additional revenue (uses 30d avg AOV × 1.5% conversion baseline)

Wire to `WarehouseInventoryPanel`: add "Run Global Audit" button, render the report card under the existing 30d revenue grid. Show the rotating list of reactivatable products with a one-click "Re-queue for Pinterest" action that flips `creative_meta.eligible_for_pinterest = true` and enqueues into `pinterest_publish_queue`.

## 9. Out of scope

- New warehouse beyond US/EU/CN.
- Order-routing / fulfillment splitting (still single-warehouse per order at checkout).
- Real-time per-second CJ pull; relies on existing periodic sync.
- EU storefront translation / VAT pricing.

## Files

Created:
- migration: products generated columns + `product_replacement_candidates`
- `supabase/functions/inventory-replacement-scan/index.ts`
- `supabase/functions/inventory-global-audit/index.ts`
- `src/components/admin/InventoryGlobalAuditCard.tsx`
- `src/components/product/InventorySourceBadge.tsx`

Edited:
- `src/lib/warehouse-availability.ts` + edge mirror (add hook + score helpers)
- `src/lib/availability.ts` (prefer `effective_stock`)
- `src/lib/merchant-safe-product.ts` (badge + delivery estimate)
- `supabase/functions/_shared/pinterest-eligibility.ts`
- `supabase/functions/cinematic-ad-orchestrator/index.ts`
- `supabase/functions/pinterest-video-publisher/index.ts`
- `supabase/functions/pinterest-pin-creator/index.ts`
- `src/components/admin/WarehouseInventoryPanel.tsx` (mount audit card)
- `mem/marketing/pinterest-revenue-engine-v4.md`

Approve to implement, or tell me which sections to drop.

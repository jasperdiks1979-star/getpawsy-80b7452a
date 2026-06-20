# Global Product Recovery Engine V1

Goal: a proven winner never disappears because of a local stock issue. A product is only deactivated after a worldwide stock + supplier + replacement search has failed.

This builds on top of: Inventory Engine, Self-Healing Pipeline, Autonomous Revenue AI V1, Gold Standard, and the existing CJ integration.

## What we build

### 1. Winner Product Database (`winner_products`)
Daily-refreshed table of protected SKUs.
- Inputs: `revenue_ai_pin_performance`, `revenue_ai_revenue_scores`, `pinterest_pin_performance`, `cinematic_pin_performance`.
- Score = weighted blend (revenue 35, outbound CTR 20, saves 15, video score 15, conversion 15) — top 100 globally + top 25 per niche → `is_protected = true`.
- Protected SKUs are **excluded** from `inventory-global-audit`'s automatic deactivation and from `revenue-ai-product-eliminator`.

### 2. Global Inventory Audit (`product-global-audit`)
Per-SKU live worldwide check.
- Calls CJ `product/stock/getInventoryByPid` + `product/query?features=enable_inventory` for US, EU (DE/UK/FR/ES), CN, AU.
- Writes `product_global_inventory` rows: warehouse, qty, shipping_days, freight_estimate, last_checked_at.
- Recomputes `effective_global_stock` (sum across all usable warehouses).
- Trigger: cron every 30 min for protected SKUs, hourly for `effective_stock<=5`, daily for the rest.

### 3. Supplier Discovery (`supplier-discovery`)
When global stock = 0 or running low:
- CJ search by `productNameEn`, `productSku`, `categoryId`, image-hash (already cached in `pinterest_pin_image_match`).
- Score candidates on: title similarity, image similarity, weight match, price band, status≠3 (off-shelf).
- Persists ≥10 candidates per winner into `product_supplier_candidates`.

### 4. Alternative Supplier Engine (`supplier-swap`)
Picks the best candidate and atomically swaps the supplier behind the SAME `products.id`.
- Updates: `cj_product_id`, `supplier_sku`, `inventory_source`, warehouse stocks, cost price.
- Preserves: `slug`, `image_url`, `id`, all `product_media`, all `pinterest_*` rows, all reviews, all SEO/canonical state.
- Logs the swap in `product_supplier_swaps` with before/after snapshot for rollback.

### 5. Best Alternative Match (`product-replacement-finder`)
If no supplier exists for the original product worldwide:
- Searches CJ + internal catalog for ≥90% match on shape/function/material/price/audience.
- Match scoring shares the same heuristic as `cinematic_creative_dna` so the existing Pinterest creative still applies.
- Writes top match into `product_replacement_candidates` with `match_score`, `decision_pending`.

### 6. Media Preservation
On supplier swap or replacement promotion:
- All `pinterest_pin_queue` / `pinterest_pins` / `cinematic_v3_jobs` / `product_media` rows stay attached to the original `products.id`.
- A new row in `pinterest_evolution_log` records the swap so revenue attribution stays continuous.

### 7. Global Availability Status
Single derived enum exposed via the existing `products_public` view:
`US Available · EU Available · Global Available · Low Stock · Sold Out`.
Computed from `effective_global_stock`, never from `us_stock` alone.

### 8. Pinterest Protection
- `pipeline-auto-replenish`, `cinematic-ad-autopublish`, and `revenue-ai-loser-suppress` consult `winner_products.is_protected` before any skip/eliminate decision.
- Pins for protected SKUs keep publishing as long as `effective_global_stock > 0`, with copy auto-switched to "Ships Worldwide · 8–15 business days" when US=0 (already supported by `pickInventoryHook`).

### 9. Self-Healing Inventory
New orchestrator `recovery-engine-tick` (cron, every 15 min):
1. Find SKUs where `effective_global_stock = 0` AND `is_protected = true`.
2. Run global audit → if still 0, run supplier discovery.
3. If a viable candidate exists → auto-swap (preserve media).
4. If not → run replacement finder; queue ≥90% match for admin one-click promote.
5. Only after all four steps fail → mark product `is_active=false` and fire `monitoring_alerts` with `severity=high`.

### 10. Admin Surface
New panel `ProductRecoveryEnginePanel` on `/admin/revenue-ai`:
- Tabs: Winners · Global audits · Supplier candidates · Replacement queue · Swap log.
- One-click "Run recovery now" per SKU; "Promote replacement" with diff preview (image, price, weight, warehouses).
- KPI strip: protected SKUs, SKUs in recovery, swaps last 24h, alerts open.

### 11. Durian Cat Scratching Bed — special audit
Re-run the new pipeline immediately for `cj_product_id = 2006968402615898113`:
- Confirms global=0 (already known: CJ status=3).
- Runs supplier discovery with image-hash + title; writes candidates.
- Runs replacement finder; writes top ≥90% match into the queue for review.
- Reports: global stock, best warehouse, best supplier, est. delivery, recommended action (`keep`, `migrate`, `replace`).
- Because the product is already winner-tagged historically, it stays in `winner_products` with `recovery_mode=true` so its Pinterest media is preserved.

## Database additions
- `winner_products` (sku, score, signals jsonb, is_protected, refreshed_at)
- `product_global_inventory` (product_id, warehouse, qty, shipping_days, cost, last_checked_at)
- `product_supplier_candidates` (product_id, supplier, supplier_product_id, match_score, signals jsonb, status)
- `product_supplier_swaps` (product_id, from jsonb, to jsonb, reason, executed_at)
- Existing `product_replacement_candidates` reused (already has the right shape).
All with RLS + GRANT to `authenticated` + `service_role`, admin-only writes.

## New edge functions
`winner-product-refresh` · `product-global-audit` · `supplier-discovery` · `supplier-swap` · `product-replacement-finder` · `recovery-engine-tick` · `recovery-engine-dashboard`.

All Lovable-Cloud functions (no manual deploy step). Cron schedules added via the standard `cron.schedule` insert flow.

## Files touched
- New: migration, 7 edge functions, `_shared/recovery-engine.ts`, `ProductRecoveryEnginePanel.tsx`.
- Updated: `pipeline-auto-replenish`, `revenue-ai-product-eliminator`, `revenue-ai-loser-suppress`, `cinematic-ad-autopublish` (winner-aware), `src/integrations/supabase/types.ts`, `RevenueAiPage.tsx`, memory index.

## Out of scope (deliberate)
- Non-CJ suppliers (only CJ catalog is wired today; the engine is multi-supplier ready but Topdawg/PetDropshipper hooks stay stubs).
- Auto-promotion of replacements with match < 90% (always admin-gated).
- Per-warehouse pricing surfaces on the storefront (badge only, no price split).

Approve to build.

---
name: Global Product Recovery Engine V1
description: Winner protection, worldwide audit, auto supplier swap, replacement queue, self-healing tick
type: feature
---
Goal: a proven Pinterest winner is never deactivated for local OOS. The pipeline searches worldwide stock, alternative CJ listings, and >=90% match replacements before marking a product inactive.

Tables: `winner_products` (top 100 global + top 25/niche, `is_protected`), `product_global_inventory`, `product_supplier_candidates`, `product_supplier_swaps`, `recovery_engine_runs`. Existing `product_replacement_candidates` reused for internal swaps.

Functions: `winner-product-refresh` (daily 03:45 UTC), `product-global-audit`, `supplier-discovery`, `supplier-swap` (admin-gated), `product-replacement-finder`, `recovery-engine-tick` (cron every 15m), `recovery-engine-dashboard`. Shared helper at `_shared/recovery-engine.ts`.

Integration hooks:
- `revenue-ai-product-eliminator` skips any product in `winner_products` where `is_protected = true`.
- `supplier-swap` preserves `products.id`, `slug`, `image_url`, all pins, all `product_media`, all reviews; logs to `pinterest_evolution_log` for continuity.

Alerts via `monitoring_alerts` with `category='recovery_engine'`, `alert_key='winner_lost:<product_id>'` — fired only when worldwide stock + supplier discovery + replacement finder all fail.

Admin: `ProductRecoveryEnginePanel` mounted on `/admin/revenue-ai`.
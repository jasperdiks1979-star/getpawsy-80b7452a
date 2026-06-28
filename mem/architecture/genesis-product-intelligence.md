---
name: Genesis Product Intelligence DNA
description: Permanent commercial intelligence layer (gpd_* tables, gpd-api edge fn, /admin/product-intelligence). Every engine consults before recommending/promoting/pricing/publishing/retiring.
type: feature
---
# Genesis Product Intelligence DNA

Permanent commercial intelligence layer. Sixth Genesis layer after Constitution, Business, Customer Psychology, Pinterest, Creative and Analytics DNA.

## Modules (12)
genome, commercial, customer_fit, intent, lifecycle, health, opportunity, trend, bundle, price, inventory, prediction.

## Tables (gpd_*)
- Identity/versioning: `gpd_modules`, `gpd_concepts` + `gpd_concept_history` (auto-snapshot on weight/confidence/evidence change).
- Product genome: `gpd_products` (supplier, cj_product_id, category, lifecycle_stage, status, dimensions).
- Commercial: `gpd_commercial` (daily snapshot, revenue, costs, gross/net, contribution, breakeven_roas/cpa), `gpd_price_history`.
- Customer: `gpd_customer_fit` (per-segment probability), `gpd_intent` (purchase/impulse/gift/refund/return/LTV).
- Operations: `gpd_health` (composite 0..100), `gpd_inventory` (stockout/oversupply risk, reliability).
- Growth: `gpd_opportunities`, `gpd_bundles`, `gpd_price_recommendations` (approval-gated), `gpd_trends`, `gpd_discovery`.
- Intelligence: `gpd_creative_match` (best story/emotion/headline/board/CTA), `gpd_predictions` (revenue/CTR/AOV/LTV with CI).
- Graph: `gpd_graph_nodes`, `gpd_graph_edges`. Audit: `gpd_engine_consultations`. Settings: `gpd_settings`.

## Health score
Weighted blend of sales_velocity, conversion_rate, margin, inventory_health, shipping_speed, refund_rate (inverse), customer_satisfaction, pinterest_performance, creative_performance, trend_score, seasonality. Weights live in `gpd_settings.health_weights`.

## API — supabase/functions/gpd-api
`consult`, `upsertProduct`, `recordCommercial` (auto computes gross/contribution/margin/breakeven), `recordPriceChange`, `recordHealth` (computes overall_score), `upsertIntent`, `upsertCustomerFit`, `openOpportunity`, `recordTrend`, `proposeBundle`, `recommendPrice` (pending_approval), `updateInventory`, `upsertCreativeMatch`, `predict` (revenue/etc with 95% CI), `addDiscovery`, `recommend({kind})`, `stats`. Every call logs to `gpd_engine_consultations`.

## Governance
- Pricing changes never auto-applied. `gpd_price_recommendations.status` defaults `pending_approval`.
- Retirement always recommendation-only.
- All concept changes versioned forever via snapshot trigger.
- Admin-read RLS; service_role writes.

## Client
`src/lib/gpd/client.ts` exports `GPD`. Dashboard at `/admin/product-intelligence`.
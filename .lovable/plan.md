# GetPawsy → Shopify Migration Plan

## Wave 0 — Owner Prerequisites (COMPLETED 2026-07-10)

Owner decisions recorded:
1. Dev store: created
2. Shopify plan: deferred until go-live
3. DNS: confirmed, no changes yet
4. legacy.getpawsy.pet: deferred until cutover
5. Custom Shopify App: created during Wave 1
6. Historical customers: NO — Supabase retains all order/customer history for compliance
7. CJ integration: official CJ Dropshipping Shopify App
8. Legal pages: deferred until launch
9. Tax: Shopify Tax
10. Shopify Payments: deferred until launch

## Wave 1 — Migration Framework (IN PROGRESS)

Architecture-first, no secrets, no Shopify calls.

Delivered in this wave:
- 5 new Supabase tables: `shopify_id_map`, `shopify_migration_waves`, `shopify_field_mapping`, `shopify_migration_conflicts`, `shopify_migration_audit_log`
- Wave roster W0..W14 seeded
- 30+ canonical field-mapping rules seeded (products, variants, collections, guides, blogs, pages, redirects)
- Read-only audit edge function: `shopify-migration-audit`
- Admin dashboard: `/admin/shopify-migration`

Awaiting owner approval before secrets:
- `SHOPIFY_STORE_DOMAIN` (e.g. `getpawsy-dev.myshopify.com`)
- `SHOPIFY_ADMIN_ACCESS_TOKEN` (custom-app token from Shopify admin)
- `SHOPIFY_API_VERSION` (default `2025-01`)

## Waves 2-14 — see admin dashboard for live status.

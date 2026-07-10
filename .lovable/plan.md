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

### Authentication mode: `client_credentials` (Shopify Dev Dashboard app `getpawsy-enterprise-2`)

The Dev Dashboard app does NOT use a manually copied `shpat_` token.
Server-side token provider lives at `supabase/functions/_shared/shopify-token-provider.ts`
and exchanges `client_credentials` at `POST https://{shop}/admin/oauth/access_token`.

Required Lovable Cloud secrets (server-side only, never exposed to frontend/logs/DB):
- `SHOPIFY_STORE_DOMAIN` — e.g. `getpawsy-dev.myshopify.com`
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `SHOPIFY_API_VERSION` — `2026-07`
- `SHOPIFY_AUTH_MODE` — `client_credentials`

Legacy `SHOPIFY_ADMIN_ACCESS_TOKEN` is NOT required for this connector and
has been removed from onboarding, environment validation, health checks,
connection diagnostics, and Wave 2 prerequisites. Legacy `shpat_` support for
other unrelated systems is not affected.

Diagnostics endpoint: `shopify-connection-diagnostics` (read-only).

## Waves 2-14 — see admin dashboard for live status.

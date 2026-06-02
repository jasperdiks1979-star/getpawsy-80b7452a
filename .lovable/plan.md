
## Goal

Add a reliable CJ Dropshipping → GetPawsy inventory sync so `products_public.stock` always matches CJ's US-warehouse stock, and OOS products are blocked from render/publish until CJ restocks.

Re-uses the existing `sync-stock` CJ token cache + inventory parser, but exposes a new admin-only function with dry-run, freshness tracking, and one consistent stock source for PDP, preflight, Merchant feed, and Pinterest Ad Studio.

## What gets built

### 1. Database migration

Add to `public.products`:
- `cj_variant_id text` — per-variant CJ id (when product has multi-variants)
- `inventory_source text default 'cj'` — `'cj' | 'manual' | 'none'`
- `last_inventory_sync_at timestamptz`
- `last_inventory_sync_status text` — `'ok' | 'error' | 'no_mapping' | 'discontinued'`
- `last_inventory_sync_error text`
- `inventory_manual_block boolean default false` — admin override: never auto-reactivate
- Index on `(inventory_source, last_inventory_sync_at)` for cron batching

Add `variant_stock jsonb` if not present (mirrors per-variant stock).

GRANTs follow project rules (authenticated SELECT, service_role ALL).

### 2. New edge function: `cj-inventory-sync`

`supabase/functions/cj-inventory-sync/index.ts` (`verify_jwt = false`, validates admin JWT in code via `admin.ts` allowlist).

Inputs (POST JSON):
- `dry_run: boolean` (default true on first call from UI)
- `product_ids?: string[]` (optional subset; default = all products with a CJ id)
- `max_age_hours?: number` (only resync products stale beyond this; default 12)

Behaviour:
1. Verify caller is admin (role or email allowlist) — else 403.
2. Reuse `getAccessToken(supabase)` pattern from `sync-stock`.
3. For each product:
   - Resolve CJ id from `cj_product_id` → `cj_variant_id` → `sku` → `source_url` regex (`/product/p-(\w+)\.html`).
   - If no mapping: record `last_inventory_sync_status='no_mapping'`, do NOT flip `is_active`.
   - Call `getInventoryByPid`. Sum only entries whose `areaEn`/`countryCode` contains `US` / warehouse name starts with `US-`. Ignore CN/EU stock.
   - Determine new stock + status.
4. If `dry_run`: collect intended changes, write nothing.
5. Else write per product:
   - `stock = newStock`
   - `is_active = newStock > 0 ? !inventory_manual_block : false`
   - `variant_stock` jsonb when variants returned
   - `last_inventory_sync_at = now()`, `inventory_source='cj'`, status + error
6. Rate limit: 1 req / 15s (same as `sync-stock`); cap per invocation at 50 to fit edge timeout — cron picks up the rest on next tick.
7. Return:
```json
{
  "ok": true,
  "dry_run": false,
  "scanned": 120,
  "in_stock": 84,
  "out_of_stock": 31,
  "no_mapping": 4,
  "errors": 1,
  "sample": [{ "id", "name", "before", "after", "status" }]
}
```

Register in `supabase/config.toml` with `verify_jwt = false`.

### 3. Hourly cron

Via `supabase--insert` (user-specific URL + anon key):
```sql
select cron.schedule(
  'cj-inventory-sync-hourly', '7 * * * *',
  $$ select net.http_post(
    url:='https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/cj-inventory-sync',
    headers:='{"Content-Type":"application/json","apikey":"<anon>","x-cron-secret":"<secret>"}'::jsonb,
    body:='{"dry_run":false,"max_age_hours":2}'::jsonb
  ) $$
);
```
Function accepts cron via `x-cron-secret` env match (`CJ_INVENTORY_CRON_SECRET` — added via secrets tool) so it can run unattended.

### 4. Admin UI

New page `src/pages/admin/CjInventorySync.tsx` (lazy-loaded route `/admin/cj-inventory`):
- "Run dry-run" + "Sync CJ inventory now" buttons
- Result table with counts + sample 5 products (before/after, status)
- Last cron run timestamp (read from `products_public` max `last_inventory_sync_at`)

Add link in admin nav.

### 5. Pinterest Ad Studio integration

In `src/pages/admin/PinterestAdStudio.tsx`:
- Show product's `stock` + `last_inventory_sync_at` in the product picker row.
- Before kicking prepare/preflight, if `last_inventory_sync_at` is null or > 12h old, show non-blocking warning toast: "Stock data is stale — run CJ sync first".
- `cinematic-ad-preflight` already reads stock for `product_out_of_stock` — no change there; it'll automatically pick up the fresher value.

### 6. Merchant feed

In `supabase/functions/google-merchant-feed/index.ts`:
- Use `availability = stock > 0 ? 'in_stock' : 'out_of_stock'` (already does this via `getMerchantAvailability`; verify path and add `last_inventory_sync_at` as `<g:custom_label_4>` so we can debug freshness in GMC).

### 7. Tests

`supabase/functions/cj-inventory-sync/index_test.ts`:
- CJ stock 0 → product OOS, `is_active=false`
- CJ stock > 0 → `is_active=true`, stock written
- `inventory_manual_block=true` → never auto-activate even if stock > 0
- Missing CJ mapping → `last_inventory_sync_status='no_mapping'`, `is_active` untouched
- US warehouse counted, CN ignored (mock CJ response with mixed warehouses)
- Dry-run writes nothing (assert table unchanged)

Plus a small Vitest assertion in `src/test/` that `getMerchantAvailability` + `computeAvailability` agree with `stock <= 0`.

## Files changed / added

```text
supabase/migrations/<ts>_cj_inventory_sync.sql              (new)
supabase/functions/cj-inventory-sync/index.ts               (new)
supabase/functions/cj-inventory-sync/index_test.ts          (new)
supabase/config.toml                                         (add function block)
supabase/functions/google-merchant-feed/index.ts            (custom_label_4 + availability sanity)
src/pages/admin/CjInventorySync.tsx                          (new)
src/App.tsx                                                  (lazy route)
src/components/admin/AdminNav.tsx                            (nav link — actual file name verified at build time)
src/pages/admin/PinterestAdStudio.tsx                        (stock + freshness display + stale warning)
```

Secrets to add via `secrets--add_secret`: `CJ_INVENTORY_CRON_SECRET` (only if not already present).

## Acceptance report (after first sync run)

Lovable will report:
- scanned / in_stock / out_of_stock / no_mapping / errors counts
- sample of 5 products with before → after
- confirmation that PDP, preflight, Pinterest Ad Studio, and Merchant feed all read from `products_public.stock` (single source)

## Out of scope

- Backfilling `cj_variant_id` for legacy products — flagged in `no_mapping` report so you can map them later.
- Webhook-based instant sync (CJ stock webhook) — hourly cron is sufficient for now.

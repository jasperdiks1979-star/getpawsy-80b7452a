# CJ Nightly Full Sync — Implementation Plan

This is a large, multi-system build. Before writing 2000+ lines of edge functions and a new admin page, I want to confirm scope and the few critical unknowns. The existing system already has `cj-inventory-sync` (hourly stock-only), `cj-google-sync`, `cj-dropshipping` API wrapper, `cj-sync-packaging-stock`, `merchant-feed`, etc. I will extend, not replace.

## Architecture

```text
┌──────────────────────────────────────────────────────┐
│  pg_cron 03:00 UTC → cj-nightly-product-sync (orch)  │
└──────────────────────────────────────────────────────┘
                          │
       ┌──────────────────┼──────────────────┐
       ▼                  ▼                  ▼
  cj-product-sync   cj-media-sync     cj-price-shipping-sync
  (variants +       (videos → own     (landed cost, margin,
   inventory +       Supabase         psychological price,
   supplier_status)  storage)         shipping estimate)
                          │
                          ▼
                  product_media table
                  (image|video, storage_url, hash, sort_order)
                          │
                          ▼
                refresh google-merchant-feed cache
                          │
                          ▼
                cj_sync_runs + cj_sync_items (report)
```

Orchestrator processes the catalog in batches of 25, with retry/backoff, and writes a per-run report row.

## What I will build

### 1. Database (one migration)
- `product_media` — id, product_id, media_type (image|video), storage_url, supplier_url, sort_order, alt_text, source, checksum, duration_sec, file_size, imported_at. Unique (product_id, checksum).
- New columns on `products`: `supplier_status` (available|unavailable|unknown), `landed_cost`, `estimated_shipping_cost`, `shipping_days_min/max`, `warehouse_country`, `margin_percent`, `price_sync_status`, `price_synced_at`, `shipping_sync_status`, `cj_media_synced_at`, `needs_admin_review`, `shipping_estimate_confidence`.
- New columns on `product_variants` (if table exists; otherwise extend `variants` JSON): `cj_variant_id`, `cj_synced_at`, `archived_at`, `variant_weight`, `variant_shipping`.
- `cj_sync_runs` — id, started_at, finished_at, mode (full|inventory|pricing|shipping|media|dry_run), totals JSONB, status.
- `cj_sync_items` — id, run_id, product_id, action (video_imported|inventory_changed|variant_added|price_changed|...), before, after, error.
- Proper GRANTs + admin-only RLS.

### 2. Storage
- New private bucket `product-media` with public read RLS (videos & images served from our domain).

### 3. Edge functions (new)
- `cj-nightly-product-sync` — orchestrator, accepts `{ mode, product_ids?, dry_run }`.
- `cj-media-sync` — per product: query CJ, extract video URLs, download → bucket, dedupe by sha256, upsert `product_media`.
- `cj-price-shipping-sync` — per product: pull CJ cost + shipping (US warehouse first), apply margin/psychological pricing rules, write fields, flag >25% delta as `needs_admin_review`.
- `cj-variant-sync` — per product: match by `cj_variant_id` → sku → option signature, add/update/archive.

Existing `cj-inventory-sync` is reused for stock; orchestrator calls it per batch.

### 4. Pricing rules (from spec)
- min margin 55%, target 65–72%, ending `.99`
- never auto-lower below min
- auto-allow price increases
- >25% change → `needs_admin_review=true`, **do not** apply automatically

### 5. Cron
- `pg_cron` at 03:00 UTC calling orchestrator via `net.http_post` with service-role header.

### 6. Admin UI
- New page `/admin/cj-sync-report` (route + nav entry) with:
  - Last run summary tiles (products checked, videos imported, inventory/price/shipping changes, OOS, missing mapping, failed, retry queue, next run ETA)
  - Action buttons: Run now (full / inventory / pricing / shipping / media only / dry run / selected product)
  - Per-product table with before/after diffs and image+video counts
- Extend existing `/admin/cj-inventory-sync` link with a banner pointing to the new report.

### 7. Feed safety
- `google-merchant-feed` already reads `products.image_url` (own storage). I will add a guard that rejects any image_url containing `cjdropshipping`/`cjjulistore` CDN hosts and excludes those rows from the feed, plus include first `product_media` video as `additional_image_link`/`video_link` when present.

## What I need confirmed before coding

1. **CJ video license** — CJ allows reseller use of supplier videos but quality varies. OK to import all videos and let admin demote in UI later?
2. **Storage cost** — videos can be 5–50 MB each. With ~67 active winners that's ~1–3 GB total; fine on Supabase. If catalog grows to thousands, we should add a per-run video import cap (e.g. 50 videos/night) and skip products that already have ≥2 videos. Apply this cap by default?
3. **Pricing auto-apply** — your spec says "never lower below min" and "auto-allow increases". Should price *decreases* that stay above min margin auto-apply, or always require admin review? I'll default to: small decreases (≤10%) auto-apply, larger decreases flag for review.
4. **Variant table** — current schema stores variants as JSONB on `products.variants`. Should I keep JSONB (extend in place) or migrate to a proper `product_variants` table? JSONB is faster to ship and keeps the rest of the app working; proper table is cleaner long-term. **Default: extend JSONB** unless you say otherwise.
5. **Schedule timezone** — spec says "03:00 lokale tijd / of UTC". I'll use **03:00 UTC** (matches existing crons). OK?

If you reply with answers (or just "go with your defaults"), I'll ship the full build in one pass: migration → storage bucket → 4 edge functions → cron → admin page → feed guard → verification run on 3 sample products with before/after report.

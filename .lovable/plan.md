
# CJ Fulfillment Recovery Engine

Recovers missing CJ↔Shopify fulfillment links for the existing ~452 Shopify products. Never creates, deletes, duplicates, re-imports, or renames anything in Shopify. Only writes CJ fulfillment relationships and inventory levels.

## Why this needs approval before I build

The mission spec is a multi-hour autonomous batched job across 452 products × N variants against two live external APIs (Shopify Admin + CJ). A single chat turn cannot execute it end-to-end. The correct shape is: build the engine once, then let a cron-driven worker chew through checkpoints until 100%. That build is significant and I want to confirm scope before consuming credits.

## Scope guarantees (hard rules baked into the code)

- No `productCreate`, `productDelete`, `productUpdate` on Shopify. Only `inventoryLevel` + CJ fulfillment metafields.
- No handle / SEO / image / description writes.
- Deterministic recovery is exhausted before any AI call. AI is credit-gated and only runs when `LOVABLE_AI` budget is available and `pinterest_credit_state.paused = false`.

## Data model (new tables, all under `catalog_recovery_*`)

- `catalog_recovery_index` — one row per Shopify variant: product_id, variant_id, inventory_item_id, handle, sku, barcode, vendor, title, variant_title, product_type, current_inventory, current_location, scan_hash, first_seen, last_seen.
- `catalog_recovery_mappings` — variant_id → cj_pid / cj_vid / cj_sku / warehouse / confidence / method (`exact_sku`|`exact_spu`|`legacy`|`supplier`|`variant_code`|`historical_import`|`memory`|`pattern`|`ai_similarity`) / evidence jsonb / created_at.
- `catalog_recovery_memory` — reusable patterns learned from successful mappings: sku_prefix, spu_prefix, supplier_family, variant_numbering, batch_id → cj_supplier_id, hit_count, last_used, confidence_boost.
- `catalog_recovery_batches` — batch_id, cursor, size=25, status (`pending|running|done|failed|paused_credits`), started_at, finished_at, stats jsonb.
- `catalog_recovery_events` — append-only log for forensic report.
- `catalog_recovery_sku_issues` — report-only: missing / duplicate / malformed sku, invalid barcode. Never auto-fixed.

All tables: GRANT to `service_role`, RLS on, admin-only read policy via `has_role(auth.uid(),'admin')`.

## Edge functions

1. `catalog-recovery-scan` — one-shot Shopify Admin GraphQL walker; populates `catalog_recovery_index` in pages of 100 variants; idempotent.
2. `catalog-recovery-tick` — the worker. Runs a single 25-variant batch:
   - Pull next 25 unmapped variants.
   - For each, run the deterministic ladder in order (SKU → SPU → legacy map → supplier map → variant code → historical import → memory → pattern propagation from `catalog_recovery_memory`). Stop at first hit ≥98% confidence.
   - Only if all fail AND credit guard is green: call AI-similarity fallback (title+image), cap 1 model call per variant, hard-require ≥98% score.
   - On hit: write `catalog_recovery_mappings`, upsert CJ fulfillment (via existing `cj-dropshipping` connector), immediately call `cj-inventory-sync` for that variant, verify `inventoryLevel > 0` and location bound, then update `catalog_recovery_memory` (extract sku prefix / supplier family / batch signature).
   - Checkpoint after every variant, not just batch. Retries: 3× exponential backoff on 429 / timeout / CJ maintenance. On credit exhaustion → mark batch `paused_credits`, exit clean.
3. `catalog-recovery-report` — read-only forensic report endpoint powering the admin page.

## Cron

- `catalog-recovery-tick` every 5 minutes while any batch is `pending` or `paused_credits` older than 10 min. Self-terminates when zero pending remain. Auto-resumes after ~02:00 credit refill because the cron keeps firing — no restart-from-batch-1.

## Admin UI

New page `/admin/catalog-recovery` (read-only):
- Live counters: total variants, mapped, unmapped, deterministic hits by method, AI hits, inventory verified >0, SKU issues, batches done/pending/paused.
- Table of `manual_review_candidates` (variants where the top-1 CJ candidate scored 90–97%).
- Final validation panel: Recovery %, Commerce readiness %, Fulfillment readiness %, Inventory readiness %.

## Execution flow after approval

1. Migration creates the 6 tables + grants + RLS.
2. Deploy the 3 edge functions.
3. Install the cron.
4. Trigger `catalog-recovery-scan` once. From that moment on, `catalog-recovery-tick` drains 25 variants every 5 min, learns patterns, and the mapping rate accelerates as `catalog_recovery_memory` fills up.
5. I return the initial scan result (total variants + SKU issue counts) in-chat; ongoing progress is visible on `/admin/catalog-recovery`.

## What I will NOT do in this build

- No product mutations of any kind on Shopify.
- No changes to Pinterest mappings, `products.slug`, `products.image_url`, or any of the fields protected by the Global Product Recovery Engine constitution.
- No AI calls before deterministic exhaustion; no AI calls when credit guard is red.
- No re-import, no bulk overwrite of `products` table rows.

Approve and I'll build tables → functions → cron → admin page → kick off the first scan.

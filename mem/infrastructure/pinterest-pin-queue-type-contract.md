---
name: pinterest-pin-queue-type-contract
description: Canonical TS contract for pinterest_pin_queue inserts — backdrop_* fields are draft-only and must never reach .insert().
type: feature
---
**Source of truth:** `supabase/functions/_shared/pinterest-queue-types.ts`

- `PinterestQueueInsert` — exact set of columns on the live table. Only this shape is accepted by `.insert("pinterest_pin_queue")`.
- `BackdropMetadata` — optional Pexels/Cloudinary visual fields (`backdrop_url`, `backdrop_avg_color`, `backdrop_source`, `backdrop_width`, `backdrop_height`, `backdrop_photographer`, `backdrop_pexels_page`, `backdrop_hook_group`, `backdrop_style`, `backdrop_score`, `backdrop_variants`, `uses_lifestyle_backdrop`). NEVER persisted.
- `PinterestPinDraft = PinterestQueueInsert & BackdropMetadata` — in-memory shape used for previews, dry-runs, and logs only.
- `NoBackdropFields<T>` — utility that statically forbids backdrop_* keys.

Runtime guards in `pinterest-viral-batch/index.ts`:
1. `ALLOWED_QUEUE_COLUMNS` whitelist + `sanitizeQueueRowsWithReport()` strips unknown fields and reports drops.
2. `verifyQueueSchema()` runs once per cold start and returns `SCHEMA_INVALID` with `missingColumns` if any of `REQUIRED_QUEUE_COLUMNS` is missing — short-circuits BEFORE any AI/Pexels work.
3. Sanitize report is logged per batch + per row and surfaced in the response under `sanitize.{droppedColumns,droppedCounts,rowsAffected}`.

If new enrichment fields are added: put them on `BackdropMetadata`, never on `PinterestQueueInsert`. Add the column to `ALLOWED_QUEUE_COLUMNS` ONLY when the matching DB migration ships.

---
name: pinterest-queue-visual-duplicate-guard
description: Pre-insert queue protection — last-100 queued pin pHash scan blocks visual duplicates before they reach pinterest_pin_queue.
type: feature
---
**Where:** `supabase/functions/pinterest-viral-batch/index.ts` annotation loop (after URL sanitize, before insert).

**Flow:**
1. Load `pin_image_phash` of the last 100 queued pins (ordered by `created_at DESC`) once per batch.
2. For each candidate row: compute dHash of `pin_image_url` via `computePhashFromUrl`.
3. Compare against `[...queuePhashHistory, ...inBatchPhashes]` using `maxSimilarity`.
4. If similarity > `PHASH_DUPLICATE_SIMILARITY` (0.70) → quarantine via `quarantineEvent({source:"pinterest_pin_queue", reasons:[visual_duplicate(sim=…,match=…)]})` and SKIP insert. Otherwise add the hash to `inBatchPhashes` and accept.

**DB:** `pinterest_pin_queue.pin_image_phash TEXT` (indexed). Added to `ALLOWED_QUEUE_COLUMNS` and `PinterestQueueInsert`.

**Response:** `queueProtection: { history_size, threshold, blocked }` in both success and `ALL_ROWS_QUARANTINED` paths.

**Threshold lives in** `_shared/pinterest-phash.ts` — change once, applies to backdrop generator AND queue guard.

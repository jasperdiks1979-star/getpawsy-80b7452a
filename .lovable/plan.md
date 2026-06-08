# Pinterest Destination Integrity — Permanent Hardening

Goal: **0 Pinterest destinations may ever resolve to 404, soft-404, homepage, collection, or dead PDP** — for past, present, scheduled, queued, draft, future, feed, and campaign pins.

Builds on existing infra (resolver, slug history, alias map, repair sweep, image-match gate, redirect engine). This pass closes the remaining gaps.

---

## Architecture

```text
                ┌─────────────────────────────────────────┐
                │   pinterest-destination-integrity (new) │
                │   shared validator: 12-point check      │
                └──────────────┬──────────────────────────┘
                               │
   ┌───────────────────────────┼─────────────────────────────────────┐
   │                           │                                     │
   ▼                           ▼                                     ▼
PHASE 1/6 AUDIT          PHASE 3 PUBLISH GATE              PHASE 5 DAILY MONITOR
pinterest-integrity-      cron-worker + validator           pg_cron 24h →
audit (all sources)       blocks any non-200 PDP            integrity-audit
   │                           │                                     │
   ▼                           ▼                                     ▼
PHASE 2 REPAIR           PHASE 4 SLUG TRIGGER              PHASE 7 REPORT
integrity-repair          products.slug change →             /admin/pinterest-
(uses resolver +          auto-rewrite queued/scheduled/      integrity (KPIs +
title/image match)        draft destinations + feed rows     daily history)
```

No checkout, pricing, theme, or copy changes.

---

## Phase 1 — Universal audit

New edge function `pinterest-integrity-audit` walks every source:

- `pinterest_pin_queue` (all statuses: draft / scheduled / queued / posted / failed)
- `pinterest_publish_queue`, `pinterest_video_queue`
- `pinterest_pins` (historical posted, includes ones not in queue)
- `pinterest_capi_outbox` (campaign records)
- Pinterest feed source (`products_public` rows currently exposed)

For each `destination_link` runs the **12-point check** (HTTP 200 + product page + title + image + not 404/soft-404/home/collection/redirect-loop + ≤2 hops + final host is getpawsy.pet + `data-product-slug` matches a live product).

Writes results to **existing** `pinterest_pin_audit` (+ a new `source` column) and per-run summary to `pinterest_pin_audit_runs`.

## Phase 2 — Repair

New `pinterest-integrity-repair`. For every audit row with `validation_status='broken'`:

1. Resolver ladder (existing 8-step: exact → slug-history → alias → sku → cj-map → similar → category → 404).
2. Title-similarity fallback (Jaccard ≥ 0.6 on tokens) against live catalog.
3. Image-similarity fallback (perceptual hash via existing `pinterest-image-product-match`).
4. Rewrite `destination_link` on every record type:
   - `pinterest_pin_queue.destination_link` for `draft|scheduled|queued`
   - `pinterest_publish_queue`, `pinterest_video_queue`, `pinterest_capi_outbox`
   - posted-pin records → log into `pinterest_pin_repair_log` (redirect engine handles live click)
5. Rows where steps 1–3 all fail → `repair_strategy='needs_replacement'` (no auto-pin creation).

## Phase 3 — Permanent publish gate

Edit `supabase/functions/_shared/pinterest-destination-validator.ts` to call the new 12-point check. Reject reasons: `http_non_200, soft_404, homepage_destination, collection_destination, redirect_loop, image_missing, title_missing, slug_mismatch, not_pdp`.

Edit `pinterest-cron-worker/index.ts`: on validation fail → run `integrity-repair` for that row → revalidate once → if still broken, mark `status='blocked_invalid_url'`, never publish.

Also gates `pinterest-publish-queue` worker and `pinterest-video-publisher` the same way.

## Phase 4 — Slug-change auto-sync

DB trigger (additive to existing slug-history trigger): on `UPDATE products SET slug` →

- insert row into `product_slug_history` (existing)
- `UPDATE pinterest_pin_queue, pinterest_publish_queue, pinterest_video_queue, pinterest_capi_outbox SET destination_link = replace(...)` for any row matching the old slug
- Posted-pin rows in `pinterest_pins` stay untouched (the `/products/:slug` redirect already handles live clicks via slug-history).

Trigger logs to new lightweight table `pinterest_slug_sync_log` for the admin page.

## Phase 5 — Daily monitor

`pg_cron` job (24h, 04:00 UTC) → `net.http_post` to `pinterest-integrity-audit?mode=daily&autorepair=true`. Writes daily summary into `pinterest_pin_audit_runs`. Surfaced on the admin page.

## Phase 6 — Historical sweep

One-shot invocation of `pinterest-integrity-audit?mode=historical` walks every `pinterest_pins` + every `pinterest_pin_queue.status='posted'`. For each broken historical pin:

- if Pinterest API supports editing the pin's destination → patch it via `pinterest-pin-edit-destination` (new helper using `PATCH /v5/pins/{id}`).
- otherwise log into `pinterest_pin_repair_log` with `repair_strategy='needs_replacement'` (existing redirect engine still saves the click).

No pin deletions.

## Phase 7 — Report + admin dashboard

Extend existing `/admin/pinterest-url-recovery` (or add a sibling `/admin/pinterest-integrity`) with KPIs:

- total pins scanned · URLs scanned · broken found · repaired · active validated · queued validated · scheduled validated · historical validated
- % passing validation
- Last 30 days of daily-monitor runs
- Slug-sync log (recent auto-rewrites)
- Manual buttons: Run Audit · Run Repair · Run Historical Sweep · Re-validate Queue

Final response will include the same numbers from the first live run.

---

## Files

**Create**
- `supabase/functions/_shared/pinterest-integrity-check.ts` — 12-point validator
- `supabase/functions/pinterest-integrity-audit/index.ts`
- `supabase/functions/pinterest-integrity-repair/index.ts`
- `supabase/functions/pinterest-pin-edit-destination/index.ts`
- `supabase/migrations/<ts>_pinterest_integrity.sql` — `pinterest_slug_sync_log` + audit `source` column + slug-sync trigger + pg_cron schedule + GRANTs/RLS
- `src/pages/admin/PinterestIntegrityPage.tsx`

**Edit**
- `supabase/functions/_shared/pinterest-destination-validator.ts` — delegate to 12-point check
- `supabase/functions/pinterest-cron-worker/index.ts` — gate + auto-repair-then-revalidate
- `supabase/functions/pinterest-publish-queue/index.ts` — same gate
- `supabase/functions/pinterest-video-publisher/index.ts` — same gate
- `src/App.tsx` — lazy admin route
- memory: pinterest-integrity contract

**Out of scope**
Pin deletions, mass replacement pin generation without approval, checkout/pricing/SEO copy, design changes.

---

## Acceptance criteria

- Live run shows ≥99% of Pinterest destinations passing the 12-point check (remaining <1% all have `needs_replacement` with documented reason).
- Cron worker provably refuses to publish any pin failing validation (test row stays at `blocked_invalid_url`).
- Slug change on one test product auto-rewrites all matching queued/scheduled/draft rows within one transaction.
- Daily monitor logs visible on admin page.
- Final chat report contains every counter listed in Phase 7.

---

**Approve to proceed.** I'll ship in two reviewable batches:

- **Batch A (read + gate):** migration, 12-point validator, audit function, publish-gate edits, slug trigger, admin page skeleton, daily cron. Zero pin mutations.
- **Batch B (repair + historical):** repair function, historical sweep, pin-edit-destination helper, full report. Runs only after Batch A's audit numbers are reviewed.

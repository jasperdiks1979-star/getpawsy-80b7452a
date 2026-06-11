---
name: Pinterest content refresh job
description: Edge function pinterest-content-refresh — scans published pins for old banned overlays, regenerates via board templates, archives outdated rows.
type: feature
---
**Endpoint:** `POST /functions/v1/pinterest-content-refresh` (admin role required).

**Body:** `{ dry_run?: boolean, limit?: number /* default 100, max 1000 */ }`.

**Flow:**
1. Scans `pinterest_pin_queue` (status ∉ archived/failed/rejected/deleted/error) per `BANNED_PIN_PHRASES` × {pin_title, pin_description, overlay_text} via `ilike` (commas safe).
2. Orders by `pinterest_pin_performance.performance_score*100 + clicks*10 + impressions` (top performers first).
3. Builds new copy via `buildPinCopy()` + board template picked from `board_name`/`category_key`, falling back to `detectNiche()`. Validates with `validatePinCopy()`.
4. Inserts replacement draft (status=`draft`, priority=`high`, same `destination_link`, `pin_image_url`, `board_name`, `product_id`, `category_key`, `hook_group`). Stamps `replacement_for_pin_id` → old id.
5. Marks old row `status='rejected'` + `rejection_reason='content_refresh_banned_overlay'` (table CHECK does NOT allow 'archived').

**Response report rows:** `{ old_pin_id, new_pin_id, board, product, product_slug, status: 'replaced'|'dry_run'|'error'|'skipped', reason? }`.

**Guards:** every insert/update also flows through the DB trigger `public.enforce_pin_copy_rules`, so any copy regression is rejected by both layers.

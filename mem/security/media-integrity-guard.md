---
name: Media Integrity Guard
description: Detection-only image scanner. BLOCKED/REVIEW images cannot be used by Pinterest publisher or Creative Director.
type: feature
---
**Tables:** `media_audit(product_id, image_url UNIQUE, status, confidence, issues, ...)` + `media_audit_runs`. `products.pinterest_eligible` flips false when every image is BLOCKED.

**Status rules:** confidence ≥ 0.90 → BLOCKED; ≥ 0.70 → REVIEW; else CLEAN.

**Detectors:** CJK + Cyrillic text, watermarks, QR codes, supplier logos, measurement lines, red guide lines, arrows, factory annotations, promotional stickers, price labels. Model: `google/gemini-2.5-flash`.

**Scanner:** `supabase/functions/media-integrity-scan` (verify_jwt=false). Upserts on `(product_id,image_url)`. Skips images scanned after `products.updated_at` unless `force=true`.

**Triggers:** nightly cron `nightly-media-integrity-scan` at 02:15 UTC; fire-and-forget call from `cj-backfill-media-variants` on completion; manual button in `/admin/media-quality`.

**Enforcement:** `_shared/pinterest-integrity-guard.ts` `media_integrity` check — any pin whose `pin_image_url` has status BLOCKED or REVIEW is blocked at insert AND publish time. No override.

**Dashboard:** `/admin/media-quality`. No source images modified. No AI repair.

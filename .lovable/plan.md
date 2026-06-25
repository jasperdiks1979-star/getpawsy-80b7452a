# CJ Media Intelligence Platform — Implementation Plan

## Reality check

This project already has ~70% of what's requested:

- `cj-rehost-product-images` — downloads CJ images → Supabase Storage
- `cj-video-ingest-worker` + `pinterest_video_assets` — video rehosting
- `cj-nightly-product-sync` — nightly CJ diff sync
- `media-integrity-scan` + `media_audit` — QC (watermarks, CJK text, supplier logos)
- `media-master-pipeline` — existing orchestrator
- `product_media`, `product_media_audit`, `product_image_compliance` tables
- `pinterest-eligible` enforcement via integrity guard

Building a parallel "Media Intelligence Engine" from scratch would duplicate all of this, burn AI/storage credits, and break the existing Pinterest integrity contract. The right move is **extend + unify + dashboard**, not rebuild.

## What I will build (additive only)

### 1. Database (1 migration)
- `cj_media_sync_runs` — run-level metrics (products scanned, images/videos downloaded, failures, storage delta, duration)
- `cj_media_asset_registry` — per-asset row: `product_id`, `kind` (image/video), `role` (main/variant/lifestyle/hero/thumb), `source_url`, `storage_path`, `checksum`, `width/height`, `bytes`, `quality_score`, `derived_from`, `created_at`. UNIQUE on `(product_id, checksum)` for dedupe.
- `cj_media_derivative_jobs` — queue for derivatives (webp/thumb/pinterest/og) with status + retries
- All admin-only RLS, with `service_role` GRANTs.

### 2. Edge functions (3 new, extend 1)
- **`cj-media-orchestrator`** (new) — the "Phase 14" controller. Iterates products in batches of 25, fans out to `cj-rehost-product-images` + `cj-video-ingest-worker`, then enqueues `media-integrity-scan`, then flips `pinterest_eligible` when quality gate passes. Writes one row per run to `cj_media_sync_runs`. Crash-safe via cursor in `app_config`.
- **`cj-media-derivative-worker`** (new) — consumes `cj_media_derivative_jobs`. Generates **webp + thumbnail + pinterest 2:3 + og 1200x630** using `@jsquash/webp` (Deno-native, no external service). Skips other variants from the wishlist (story/square/landscape/etc.) — they can be added later if actually consumed by a surface. **No video transcoding** (would require ffmpeg infra that doesn't exist here and burns money); we keep the existing rehosted MP4 + extract a poster frame only.
- **`cj-media-registry-backfill`** (new, one-shot) — walks existing `product_media` + `pinterest_video_assets` and populates `cj_media_asset_registry` so the dashboard has historical data.
- **Extend `cj-nightly-product-sync`** — after diff sync, call `cj-media-orchestrator` with `mode=delta`.

### 3. Cron
- Nightly 03:30 UTC: `cj-media-orchestrator` (mode=delta)
- Every 15 min: `cj-media-derivative-worker` (drains queue, max 50 jobs/run for credit safety)

### 4. Admin dashboard
- New route `/admin/media-intelligence` with: latest run status, products processed, images/videos rehosted, failure count, storage usage, AI-readiness % (= eligible products / total active), retry queue depth, "Run full sync now" button.

## What I will NOT build (and why)

| Requested | Why skipped |
|---|---|
| 20+ image derivative formats (retina, transparent PNG, story, landscape, portrait, banner, etc.) | No surface consumes them. Generating 20 versions × 400 products × multiple images = massive storage + CPU. I'll generate the 4 that are actually used. |
| Full video transcoding pipeline (1080p/720p/9:16/square/gif) | Requires ffmpeg worker infra (render-worker exists for cinematic ads only). Would cost real money per video. Current pin publisher uses source MP4 fine. |
| AI alt text / scene / object / pet / room detection for every asset | Per Core memory: **"NO expensive AI jobs"**. Hundreds of products × multiple images via vision model = thousands of credits. Existing `media-integrity-scan` already covers watermark/CJK/logo via Gemini Flash on demand. |
| New per-product version history table | Existing `product_media_audit` + `cj_variant_repair_runs` cover this. |
| Parallel ad-hoc worker fleet | Edge functions already run concurrent invocations; orchestrator batches with retry. |

If you want any of the above turned on, say which surface will consume the output and I'll wire it.

## Execution order

1. Migration (await approval)
2. 3 edge functions + extend nightly sync
3. Dashboard page + route
4. Schedule crons
5. Run `cj-media-registry-backfill` once
6. Trigger `cj-media-orchestrator` (mode=full) — report run ID + live counts

## Open question (one, only if you disagree)

The wishlist asks for ~20 image variants and full video transcoding. My plan ships 4 image derivatives and skips video transcoding because nothing consumes the extra variants today and they'd burn storage + credits. **Confirm**: ship the lean version (recommended), or do you want a specific extra variant (e.g. transparent PNG for ads)?

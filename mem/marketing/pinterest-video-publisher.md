---
name: Pinterest Video Publisher
description: Discovery + queue + publisher pipeline for native Pinterest Video Pins, isolated from image queue
type: feature
---
**Tables (all admin-only RLS):** `pinterest_video_assets`, `pinterest_video_queue`, `pinterest_video_publish_log`, `pinterest_video_metrics`, `pinterest_video_autopilot_settings`. View `pinterest_video_winners` aggregates per-asset CTR.

**Edge functions:**
- `pinterest-video-discovery` — recursively scans `pinterest-ads`, `tiktok-media`, `admin-resources` storage buckets for MP4s matching `getpawsy-tiktok-*|getpawsy-litterbox-*|*timepain*|*smell*|*direct*`. Skips files <50KB. Dedups by SHA-256 of `bucket|path|size|updated_at`.
- `pinterest-video-publisher` — actions: `queue_draft`, `queue_all_drafts`, `reroll`, `publish`. Publish flow: register `/v5/media` → POST upload to S3 with returned upload_parameters → poll `/v5/media/{id}` (max 60s) → `POST /v5/pins` with `media_source.source_type=video_id`.
- `pinterest-video-metrics-sync` — daily IMPRESSION/OUTBOUND_CLICK/SAVE pull, upserts into `pinterest_video_metrics` keyed by `(pin_id, day)`.

**Shared modules (no esm.sh, Deno-safe):**
- `_shared/pinterest-video-hooks.ts` — pure-string classifier into `pain|smell|time|transformation|social_proof|curiosity|direct|unknown`.
- `_shared/pinterest-video-meta.ts` — merchant-safe title/description/hashtag/CTA pools per hook + deterministic `(asset_id, attempt)` seed → enables reroll. Banned-term scrubber mirrors `src/config/merchant-policy.ts`. Destination URL hardcoded to `/products/automatic-cat-litter-box-self-cleaning-app-control` with UTM `utm_source=pinterest&utm_medium=video_pin&utm_campaign=litterbox_video`.

**Reuse:** Pinterest token from `pinterest_connection` + active connection id from `pinterest_runtime_settings`. API base from `getPinterestApiBase(sb)` (sandbox/production). Boards from `pinterest_boards` (non-blacklisted, non-sandbox, prefers name matching `self.?cleaning.*litter|litter.*box`).

**Isolation guarantees:** Does NOT touch `pinterest_pin_queue`, `pinterest-viral-batch`, `pinterest-cron-worker`, or any TikTok function. Image-pin pipeline unaffected.

**Admin UI:** `/admin/pinterest-video-queue` — mobile-first, lazy-loaded. IntersectionObserver autoplay-on-visible muted previews, sticky tap targets ≥44px, hook + status filter chips. Default action = queue draft (never auto-publish).

**Hardening:** All edge functions use `npm:@supabase/supabase-js@2.49.1` + `https://deno.land/std@0.224.0/http/server.ts` (no esm.sh — runtime-killed before). Global try/catch returns 200 + `{ok:false, code, traceId, message}` on every failure path. Heartbeat logs at each stage with traceId.
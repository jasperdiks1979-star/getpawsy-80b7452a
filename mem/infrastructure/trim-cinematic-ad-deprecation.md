---
name: Trim Cinematic Ad MP4 — DEPRECATED
description: Legacy v2 ffmpeg trim GH Actions workflow retired 2026-06-20
type: constraint
---
The `Trim Cinematic Ad MP4` GitHub Actions workflow (`trim-cinematic-ad.yml`) and its dispatcher path in `cinematic-ad-render-webhook` are deprecated as of 2026-06-20.

**Why:** It served only the legacy v2 `cinematic_ad_jobs` pipeline. v3+ (`render-cinematic-v3.yml`, `render-cinematic-v4.yml`, `render-cinematic-v5.yml`) never overshoot the duration cap because the storyboard planner enforces it before render. Pinterest publishing (`pinterest-video-publisher`, `cinematic-ad-autopublish`) consumes v3+ output via `pinterest_video_assets`, not the trim path. Last successful trim: 2026-06-02 (18+ days before retirement). Recent failure runs (#42–#66) were all caused by either missing `RENDER_WORKER_SECRET` or stale `output_mp4_url` 404s on legacy jobs that were already stuck in `needs_admin_review`.

**What was changed:**
- `.github/workflows/trim-cinematic-ad.yml` — deleted.
- `supabase/functions/cinematic-ad-render-webhook/index.ts::dispatchTrimWorkflow` — now a no-op that returns `{ ok:false, message:"trim_workflow_deprecated_2026_06_20" }`. Existing caller branches mark oversize legacy v2 jobs `status='failed'` with `auto_trim_dispatch_failed:trim_workflow_deprecated_2026_06_20`.
- `cinematic-ad-watchdog` stuck-trim synthesizer is untouched: it already marks stale `trimming` rows as failed via the webhook.

**Do NOT:** restore `trim-cinematic-ad.yml` or re-enable the dispatch without first reactivating the v2 cinematic_ad pipeline as the primary engine — which would itself be a regression away from v3+.
---
name: Pinterest Metrics Sync V1
description: 6h cron pulls per-pin Pinterest metrics, enriches with voice/scene/board/category, feeds leaderboards and auto-weights
type: feature
---
- **Cron:** `pinterest-video-metrics-sync-6h` runs every 6 hours, calling `pinterest-video-metrics-sync` with `{action:"cron"}` + anon apikey.
- **Auth modes (function):** admin JWT, cron call (action=cron + apikey matches anon), or `x-render-secret` matching `RENDER_WORKER_SECRET`.
- **Metrics pulled per pin:** IMPRESSION, OUTBOUND_CLICK, SAVE → also derives `ctr` and `engagement_rate = (clicks+saves)/impressions`.
- **Linkage columns on `pinterest_video_metrics`:** `voice_name`, `scene_slug`, `board_id`, `category` (resolved from `pinterest_voice_assignments`, `pinterest_video_assets.product_slug → products.category`, `cinematic_scene_environments.last_used_at`, and queue `board_id`).
- **Leaderboards (rolling 30d, SELECT to authenticated):** `pinterest_leaderboard_voices`, `_scenes`, `_categories`, `_boards`. Sorted by ctr_pct DESC, impressions DESC. Boards view joins `pinterest_boards.name`.
- **Auto weights:** `apply_pinterest_perf_weights()` (SECURITY DEFINER) recomputes `cinematic_voice_profiles.weight` (baseline 0.20, clamp 0.05..0.50) and `cinematic_scene_environments.weight` (clamp 0.2..2.5) using `ctr_pct / median_ctr` on rows with ≥200 impressions. Runs at the end of every sync.
- **Untouched on purpose:** video generation, publisher logic, QA gates, V5 daily cap (30) and 90-min gap.
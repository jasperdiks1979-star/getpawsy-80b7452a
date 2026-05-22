---
name: Cinematic video engine v3
description: Autonomous Pinterest publishing, storyboard AI, safe-area validator, QA floor 55
type: feature
---
- Auto-approve threshold lowered to 55 (was higher); approval-bottleneck eliminated.
- New `cinematic-ad-autopublish` edge fn runs every 2 minutes via pg_cron, registers eligible jobs in `pinterest_video_assets`. Gates: status in (publishable/approved/completed/render_complete) AND mp4 reachable AND validation_passed AND qa_composite_score >= pinterest_publish_quality_floor (55) AND pin_publish_attempts < max(2).
- New `cinematic-ad-storyboard` edge fn generates 7-beat arc (HOOK→PROBLEM→EMOTION→FEATURE→BENEFIT→PROOF→CTA) + 5 hook variants via Lovable AI (gemini-3-flash-preview); stored on `cinematic_ad_jobs.storyboard` + `hook_variants`.
- `safeAreaValidator()` and `validateScenePlanCaptions()` in `remotion/src/lib/safeZone.ts` — auto-shortens, auto-scales font, anchors top/middle/bottom, avoids subject bbox, never throws.
- Migration adds: `hook_variants`, `render_mode`, `quarantined_assets`, `pin_publish_attempts`, `pin_last_error`, `publish_blocked_reason`, `qa_composite_score` on jobs; `auto_repair_threshold`, `max_render_attempts`, `pinterest_publish_quality_floor`, `auto_publish_enabled` on settings.
- Engine version: v3 default in `cinematic_ad_settings`.

## V3 stabilization pass (final)
- **Humanized cadence:** `publish_windows_est` (7–9 / 12–14 / 19–23 EST) + per-publish jitter 7–45 min. Outside windows, autopublish returns `skipped: outside_publish_window` with `next_window_at`.
- **Recovery tier ladder:** clean-streak (0 `publish_blocked_reason` violations in `recovery_auto_exit_days`=7) auto-flips `pinterest_publish_recovery_mode=false` and lifts cap 2→3→4 pins/hour via `recovery_tier_progression`.
- **Perceptual dedupe:** `cinematic_ad_jobs` carries `thumbnail_phash`, `first3s_phash`, `overlay_text_hash`; autopublish rejects within Hamming distance ≤ `thumbnail_phash_distance_threshold` (default 6) over last 100 published pins.
- **Hook cooldown:** `hook_archetype` cannot repeat within `hook_cooldown_days` (default 7).
- **Quarantine engine:** `cinematic_quarantine_patterns` table (hook|thumbnail_phash|overlay_text|board|storyboard) — autopublish filters matches; `cinematic-pin-performance-sync` (daily cron 04:00 UTC, schedule id 92) auto-inserts patterns where engagement_rate < 0.5% AND impressions ≥ 500, 14-day quarantine.
- **Performance memory:** `cinematic_pin_performance` upserted daily from `pinterest_video_metrics` join via `pinterest_video_publish_log`.
- **Humanization pools:** `cinematic_humanization_pools` (caption_template, cta, hashtag_group, opener) — storyboard sampler uses `humanization_seed` for deterministic but varied output.
- All gates STACK on existing PinterestQualityGateV2 (QA floor 70, slug cooldown 240min, hourly cap, slideshow rejection); none weakened.

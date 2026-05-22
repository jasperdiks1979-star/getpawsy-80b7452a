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

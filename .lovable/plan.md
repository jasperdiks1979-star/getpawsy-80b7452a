# Native Short-Form Video Upgrade (v4)

Goal: lift the cinematic ad engine from "AI slideshow" feel to native TikTok/Pinterest pet-creator quality. Layer on top of v3 (autopublish, storyboard, safe-area, QA floor 55) without weakening existing gates.

---

## 1. Engine version bump → v4

Add `engine_version='v4'` default in `cinematic_ad_settings` with new tunables:
- `hook_change_max_frames` (24 @ 30fps = 0.8s)
- `scene_min_frames`/`scene_max_frames` (36–60 = 1.2–2.0s)
- `static_hold_max_frames` (60 = 2s hard cap)
- `pattern_interrupt_every_frames` (90–150 = 3–5s)
- `min_scene_count` (6), `required_scene_roles` (`['hook','problem','benefit','cta']`)
- `min_camera_motion_score`, `min_realism_score`, `min_engagement_pacing_score` (defaults 65/70/65)
- `human_realism_required` (bool), `human_realism_min` (70)

## 2. Native pacing engine

Extend `remotion/src/lib/scenePlanner.ts`:
- Enforce first-cut ≤ 24 frames (hook swap).
- Per-scene duration sampled 36–60 frames; no scene > 60 unless tagged `pattern_interrupt_hold` (max 90).
- Inject `pattern_interrupt` every 3–5s: whip-pan, speed-ramp, crop-flip, or flash-cut.
- New `validatePacing(plan)` returns scores: `scene_change_count`, `engagement_pacing_score`, `static_hold_max`.

## 3. Real camera simulation

New `remotion/src/lib/cameraSim.ts`:
- `HandheldMicroMotion` (sub-pixel jitter via `noise2D(frame)`).
- `PushInZoom`, `RackFocusSim` (CSS `filter: blur()` ramp on bg layer), `ParallaxStack` (already exists in `viralShared`).
- `WhipPan`, `SpeedRamp`, `CinematicCrop` transitions.
- `LightingShift` overlay (color-grade gradient lerp).
Apply via scene `camera_track` field on each `ScenePlanItem`.

## 4. Scene structure enforcement

In `cinematic-ad-storyboard`:
- Force LLM output to include the 4 roles `hook|problem|benefit|cta`.
- Persist `scene_roles[]` on `cinematic_ad_jobs`.
- `cinematic-ad-validate` rejects with `reason='missing_scene_role:<role>'` if any required role absent.

## 5. Motion realism scoring

Extend `cinematic-ad-validate`:
- `scene_change_count` (from plan).
- `camera_motion_score` (variance of frame-diff hashes across 0/15/30/45/60/75/90).
- `realism_score` (Gemini multimodal: 6-frame grid → "rate as native TikTok 0-100, flag slideshow/static/fake-loop/frozen-human").
- `engagement_pacing_score` (pacing validator).
- Reject if any below floor → `creative_reject_reason='slideshow_feel'|'static_motion'|'fake_loop'|'frozen_subject'`.

## 6. Human realism gate

When `has_human_subject=true` (detected via Gemini classifier on frame 30):
- Run blink/sway/breath check: sample 5 frames, compute `mediapipe`-style landmark drift via Gemini ("is this human alive 0-100, list mannequin/uncanny flags").
- Reject < `human_realism_min`.
- Store `human_flags[]` (frozen_eyes, no_blink, mannequin_pose, uncanny).

## 7. Overlay animation polish

Update `remotion/src/lib/overlay.ts`:
- All text uses `spring()` fade+slide (12-frame in, 8-frame out), never opacity-pop.
- Overlay sync: caption changes must land within 4 frames of a scene cut (validator check).
- Bounding-box check vs detected product focal box (`focal_bbox` on job) — overlays must stay outside.

## 8. Pinterest-native style presets

Seed `cinematic_ad_style_presets` with 6 new presets:
- `emotional_pet_owner`, `satisfying_cleaning`, `luxury_pet_lifestyle`, `cozy_indoor_cat`, `problem_solution`, `funny_relatable_pet`.
Each preset = pacing config + camera_tracks pool + color grade + caption style + music_mood tag. Niche detector picks default per product category.

## 9. Hook optimization

New edge `cinematic-ad-hook-optimizer`:
- Generates 5 hook variants per product across types: `curiosity`, `emotional`, `transformation`, `problem_solution`, `authority_social_proof`.
- Predicts CTR via Lovable AI scorer trained on `cinematic_pin_performance` (prompt-based, top-k examples retrieval).
- Stores in `cinematic_hook_variants` table; storyboard picks top-scored not in `hook_cooldown_days`.

## 10. Render QA preview grid

New action `qa_preview` in `cinematic-ad-validate`:
- Use ffmpeg to extract frames 1/30/60/90/last → 3x2 PNG grid → upload to `cinematic-qa/{job_id}.png`.
- Run Gemini grid check: text overflow, awkward pose, blur, contrast, dead frame, duplicate frame.
- Persist `qa_preview_url`, `qa_preview_flags[]`. Hard-block publish on any flag.

## 11. Metrics feedback loop

Cron `cinematic-style-performance-rollup` (daily 05:30 UTC):
- Joins `cinematic_pin_performance` × `cinematic_ad_jobs.style_preset` × `hook_variant_id`.
- Computes 14d rolling CTR/save/hold/completion per (preset, hook_type, niche).
- Writes `cinematic_style_weights` (used by storyboard's preset+hook picker via epsilon-greedy).
- Auto-suppresses presets with bottom-quartile composite for `style_suppression_days=7`.

## 12. Affected files / migrations

**New edge functions:**
- `cinematic-ad-hook-optimizer`
- `cinematic-style-performance-rollup`

**Edited edge functions:**
- `cinematic-ad-storyboard` (4-role enforcement, hook picker)
- `cinematic-ad-validate` (motion scores, human realism, qa_preview action)
- `cinematic-ad-autopublish` (new gates: realism, pacing, qa_preview_flags empty)
- `_shared/pinterest-video-meta.ts` (overlay sync helper)

**Edited Remotion code:**
- `remotion/src/lib/scenePlanner.ts` (pacing rules)
- `remotion/src/lib/cameraSim.ts` (new)
- `remotion/src/lib/overlay.ts` (new/extend)
- `remotion/src/MainVideo.tsx` (apply camera tracks + lighting shift)

**Migrations:**
- v4 settings + scoring columns on `cinematic_ad_jobs` (`scene_change_count`, `camera_motion_score`, `realism_score`, `engagement_pacing_score`, `scene_roles`, `human_flags`, `qa_preview_url`, `qa_preview_flags`, `focal_bbox`, `style_preset`, `hook_variant_id`).
- New tables: `cinematic_hook_variants`, `cinematic_style_weights`.
- Seed 6 new style presets in `cinematic_ad_style_presets`.

**Crons:**
- `cinematic-style-performance-rollup` daily 05:30 UTC.
- `cinematic-ad-hook-optimizer` daily 03:30 UTC (refreshes hook bank per active product).

## 13. Backward compatibility

All v4 columns nullable with defaults. `engine_version` switch — v3 jobs still validate against v3 gates; new jobs default to v4. Feature flag `cinematic_v4_enabled` in settings allows instant rollback.

## 14. Rollout

1. Migration + seed presets.
2. Ship Remotion `cameraSim` + scene planner upgrade (no behavior change until v4 flag flips).
3. Ship hook-optimizer + storyboard 4-role enforcement.
4. Ship validate scoring + qa_preview.
5. Ship autopublish gates.
6. Flip `cinematic_v4_enabled=true`; monitor 24h; flip back if reject-rate > 60%.

## Out of scope (this pass)

- Music/SFX (placeholder field reserved on presets).
- TikTok-side analytics ingestion (Pinterest only for now per current memory: TikTok organic-only).

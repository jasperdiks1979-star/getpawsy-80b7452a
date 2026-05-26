
# Cinematic Engine v5 — Native Human UGC

Layered on top of v4 (pacing rules, scene roles, realism scoring, hook bank, style feedback). Nothing weakened — v5 adds new gates and creative behaviors behind `cinematic_v5_enabled` flag, instant rollback to v4.

Target: outputs indistinguishable from real pet-owner Pinterest Idea Pins / TikTok UGC.

---

## 1. Database (single migration)

`cinematic_ad_settings` (new columns, all with defaults so v4 jobs unaffected):
- `engine_version_default='v5'`, `cinematic_v5_enabled=true`
- `camera_styles` jsonb default `['iphone_vertical_closeup','pet_owner_followcam','floor_level_cat_cam','casual_lifestyle_pan','over_the_shoulder','reaction_selfie_style']`
- `handheld_jitter_amp=1.0`, `focus_breathing_amp=0.6`, `exposure_drift_amp=0.4`, `framing_correction_chance=0.35`
- `required_beats_v5=['hook','pattern_interrupt','problem','emotional_payoff','benefit','social_proof','cta']`
- `max_static_duration_frames=54` (1.8s), `scene_change_min=4`, `scene_change_target_range=[36,75]` (1.2–2.5s)
- Score floors: `min_motion_entropy=6`, `min_realism_consistency=7`, `min_ugc_authenticity=7`, `min_emotional_arc=6`, `min_thumb_stop_score=7`
- `human_presence_required_ratio=0.5` (≥50% of scenes must contain human/hand/pet-interaction)
- `environment_realism_min=7`, `ban_showroom=true`

`cinematic_ad_jobs` (additive nullable columns):
- `camera_style`, `beats_v5` jsonb, `scene_change_count`, `motion_entropy_score`, `realism_consistency_score`, `ugc_authenticity_score`, `emotional_arc_score`, `thumb_stop_score`, `human_presence_ratio`, `environment_flags` text[], `v5_reject_reasons` text[], `validation_v5_passed` bool

New table `cinematic_performance_signals` (per finished pin):
- `job_id`, `pin_id`, `outbound_ctr`, `save_rate`, `hold_rate`, `completion_rate`, `add_to_cart_rate`, `composite_score`, `window_days`, `updated_at`
- GRANT to service_role only (read by edge fns), RLS on.

New table `cinematic_style_bias` (epsilon-greedy weights, extends v4 style_weights with v5 dimensions: camera_style + beat_structure + hook_type):
- `niche`, `camera_style`, `hook_type`, `beat_signature`, `weight`, `suppressed_until`, `composite`, `sample_size`
- GRANT auth-only read, service_role write.

Seed: 6 camera-style presets in `cinematic_ad_style_presets` mapped to niches (cat → floor_level_cat_cam, dog → pet_owner_followcam, litter → reaction_selfie_style, etc.).

## 2. Remotion — `remotion/src/lib/humanCamera.ts` (new)

Pure frame-based motion (NEVER css transitions):
- `useHandheldTransform(frame, { style, amp })` → `{tx, ty, rot, scale, blurPx, exposureMul}` driven by layered `noise2D` at different frequencies (jitter 0.5–2px sub-pixel, drift 4–10s low-freq).
- Per-style profiles (jitter amp / drift radius / tilt / vignette / FOV crop):
  - `iphone_vertical_closeup` — heavy jitter, tight crop, occasional re-frame snap
  - `pet_owner_followcam` — medium drift, follow-bias toward focal_bbox
  - `floor_level_cat_cam` — low-angle (skew Y), gentle handheld
  - `casual_lifestyle_pan` — slow lateral drift + breath bob
  - `over_the_shoulder` — partial foreground vignette, soft focus near edges
  - `reaction_selfie_style` — short snap-zooms + framing corrections
- `useFocusBreathing(frame, amp)` → CSS `filter: blur(...)` ramp 0–1.2px on bg layer (sparingly — sandbox crash rule).
- `useExposureShift(frame, amp)` → brightness/contrast multipliers lerped over 3–6s windows.
- `useFramingCorrection(frame, chance, seed)` → deterministic seeded snap-recenter every ~4–6s.
- Helper `applyHumanCamera(child, {style, amp, focalBox})` wraps any scene root.

Update `remotion/src/MainVideo.tsx` and cinematic scene shells (e.g., `cinematic/UgcPovScene.tsx`) to read `camera_style` from props and apply `applyHumanCamera`. Replace existing simple Handheld with v5 module behind a prop flag so v4 renders unchanged.

## 3. Storyboard — `cinematic-ad-storyboard`

- Force LLM output to 7 beats `hook|pattern_interrupt|problem|emotional_payoff|benefit|social_proof|cta` with per-beat constraints: duration 36–75 frames, max static 54 frames, ≥1 human/hand cue per 2 beats, emotional valence escalation (curve from tension→relief).
- Persist `beats_v5`, `camera_style` (picked from style_bias epsilon-greedy: niche×camera_style top weight 70%, explore 30%).
- Inject environment prompt rules into per-beat image prompt: "real pet owner home, lived-in, soft clutter, natural window light, mild lens vignette, slight motion blur, iPhone HDR look. AVOID: empty showroom, studio backdrop, perfect symmetry, plastic surfaces, magazine staging."
- Require ≥1 beat with `subject_includes=['hand','arm','owner_pov']` and ≥1 with `subject_includes=['pet_reaction']`.

## 4. Validation — `cinematic-ad-validate`

New action segment `v5_score` runs after v4:
- `scene_change_count` from beats_v5 (reject < 4).
- `motion_entropy_score`: frame-diff variance across 8 sampled frames vs entropy floor (reject < 6).
- `realism_consistency_score`: Gemini multimodal on 4-frame strip — "rate environment consistency 0-10, flag teleport/style-flip" (reject < 7).
- `ugc_authenticity_score`: Gemini "rate as authentic phone-shot UGC vs AI ad 0-10, flag: showroom, render_sheen, perfect_symmetry, floating_camera, slideshow" (reject < 7).
- `emotional_arc_score`: derive from beat valence sequence (reject < 6).
- `thumb_stop_score`: Gemini on first frame only — "would this stop a Pinterest scroll without audio? 0-10, flag low_contrast/no_subject/text_overflow" (reject < 7).
- `human_presence_ratio` from beats_v5 metadata (reject < `human_presence_required_ratio`).
- `environment_flags`: persist any `showroom|sterile|impossible_lighting|empty_room` → hard reject.
- Failures populate `v5_reject_reasons[]`, set `validation_v5_passed=false`, status `creative_rejected`, reason `v5_reject:<comma-list>`.

## 5. Autopublish — `cinematic-ad-autopublish`

Add hard gate: `validation_v5_passed=true` when job's `engine_version='v5'`. v4 jobs continue to gate on v4 only. Block reason `publish_blocked_reason='v5_reject:<...>'`.

## 6. Performance learning — `cinematic-performance-ingest` (new) + extended `cinematic-style-performance-rollup`

- `cinematic-performance-ingest` (cron `*/30 * * * *`): pulls `cinematic_pin_performance` deltas → upserts `cinematic_performance_signals` with composite = `0.35*ctr + 0.25*save + 0.20*hold + 0.10*completion + 0.10*atc`.
- Rollup extended (daily 05:30 UTC): joins signals × jobs on `(niche, camera_style, hook_type, beat_signature)` → 14d rolling weights → writes `cinematic_style_bias`. Bottom quartile → `weight=0.15`, suppressed 7d. Top quartile → `weight=1.8`. Storyboard picker reads this table via epsilon-greedy (ε=0.15).
- Repetition guard: any (hook_text, camera_style) used in last 3 published pins gets `weight*=0.4`.

## 7. Hook bank — extend `cinematic-ad-hook-optimizer`

Add `emotional_register` field to each generated variant (`tender|surprise|relatable_pain|aspirational|funny`). Storyboard rotates registers across last 5 pins to enforce emotional variation (reject if last-3 share register).

## 8. Feature flag & rollback

- `cinematic_v5_enabled` (default true after migration). When false: storyboard/validate fall back to v4 paths; existing v4 jobs unaffected.
- Auto-rollback: if rolling 24h `v5_reject_rate > 0.6`, edge function sets flag false and logs alert.

## 9. Files

**New edge functions:**
- `supabase/functions/cinematic-performance-ingest/index.ts`

**Edited edge functions:**
- `cinematic-ad-storyboard` (7 beats, camera style picker, env prompt rules, register rotation)
- `cinematic-ad-validate` (v5 scoring block)
- `cinematic-ad-autopublish` (v5 gate)
- `cinematic-ad-hook-optimizer` (emotional_register)
- `cinematic-style-performance-rollup` (camera_style + beat_signature dims, repetition guard)
- `_shared/pinterest-video-meta.ts` (env-realism + thumb-stop helpers)

**New Remotion:**
- `remotion/src/lib/humanCamera.ts`
- Edits in `remotion/src/MainVideo.tsx`, `remotion/src/cinematic/UgcPovScene.tsx` (and other cinematic scene shells) to consume `camera_style` + `applyHumanCamera`.

**Migration:**
- `supabase/migrations/<ts>_cinematic_engine_v5.sql` — settings columns, jobs columns, new tables (`cinematic_performance_signals`, `cinematic_style_bias`) with grants/RLS, seed style-preset → camera_style mapping.

**Config:**
- `supabase/config.toml` — register `cinematic-performance-ingest`; cron `*/30 * * * *`.

**Memory:**
- `mem/features/cinematic/video-engine-v5.md` summarizing rules.

## 10. Backward compatibility

All columns nullable with defaults; v4 jobs untouched. v5 gates only apply when `engine_version='v5'`. Remotion v5 camera applied only when `camera_style` prop present.

## 11. Out of scope this pass

- Music/SFX selection per emotional register (reserved field on presets).
- TikTok publisher integration (Pinterest-only per existing policy; TikTok organic-only).
- Real face/blink Mediapipe detection (Gemini proxy used).
- 3D parallax / depth-map driven camera (future).

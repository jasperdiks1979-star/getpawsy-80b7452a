---
name: Cinematic video engine v4
description: Native short-form quality upgrade — pacing rules, scene-role enforcement, realism scoring, hook bank, style feedback loop
type: feature
---
- Engine version bump to **v4** (`cinematic_ad_settings.engine_version_default='v4'`, feature flag `cinematic_v4_enabled`).
- **Pacing rules** (defaults): first cut ≤24 frames (0.8s), scenes 36–60f (1.2–2.0s), no static hold >60f, pattern interrupt every ≤150f (5s), ≥6 scenes per ad.
- **Required scene roles** (`required_scene_roles=['hook','problem','benefit','cta']`) derived from the 7-beat storyboard via `deriveSceneRoles()` and persisted to `cinematic_ad_jobs.scene_roles`.
- **v4 scoring** added in `cinematic-ad-validate`: `scene_change_count`, `camera_motion_score`, `realism_score`, `engagement_pacing_score`. Floors: 65 / 70 / 65. Failures land in `v4_reject_reasons[]` and flip status to `creative_rejected`.
- **Autopublish gate**: `validation_v4_passed=false` is a hard block (`publish_blocked_reason='v4_reject:...'`). Stacks on top of all v3 gates; nothing weakened.
- **Style presets** seeded: `emotional_pet_owner`, `satisfying_cleaning`, `luxury_pet_lifestyle`, `cozy_indoor_cat`, `problem_solution`, `funny_relatable_pet` — each with pacing/caption/motion config + music mood tag.
- **Hook optimizer** (`cinematic-ad-hook-optimizer`, cron `30 3 * * *`): generates 5 hooks per product across `curiosity|emotional|transformation|problem_solution|authority_social_proof`, persists to `cinematic_hook_variants` with predicted CTR via Lovable AI.
- **Style feedback loop** (`cinematic-style-performance-rollup`, cron `30 5 * * *`): 14d rolling join of `cinematic_pin_performance` × jobs → `cinematic_style_weights` per (preset, hook_type, niche). Bottom-quartile presets get `weight=0.2` + `suppressed_until = now + style_suppression_days (7d)`; top quartile `weight=1.6`.
- **Remotion scenePlanner**: added `role` + `isPatternInterrupt` fields and `validatePacing()` helper returning `engagement_pacing_score`, `static_hold_max`, `pattern_interrupt_gap_max`.
- **Out of scope this pass**: ffmpeg-based qa_preview grid + Gemini multimodal realism scoring (proxy heuristic used now), human realism Gemini classifier, Remotion `cameraSim.ts` runtime — schema columns exist (`qa_preview_url`, `qa_preview_flags`, `human_flags`, `focal_bbox`) so future ship is additive.
- All new columns nullable; backward compatible. Disable globally with `cinematic_v4_enabled=false`.
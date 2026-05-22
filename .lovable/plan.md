## Cinematic Video Engine Overhaul — Implementation Plan

This is a large overhaul touching the render pipeline, QA engine, scene generator, and creative DNA tracking. I'll ship it in one pass as additive changes (no breaking removals).

### 1. Mobile Safe Zone System
- New module `remotion/src/lib/safeZone.ts` with constants: top 12%, bottom 22% (CTA), side 6% horizontal padding for 1080×1920.
- New `<SafeZoneFrame>` component wrapping every scene; auto-clamps caption position.
- Caption component (`SafeCaption.tsx`): auto-scales font (binary search fit), multiline balance, max 3 lines, auto-center.
- Debug overlay toggled by `render_safe_zone_debug=true` env/prop showing red boundary rectangles.

### 2. Multi-Scene Video Engine
- Refactor `remotion/scripts/render-cinematic-ad.mjs` scene planner to require 5–12 unique scenes.
- New scene category enum: `product_hero`, `closeup_detail`, `lifestyle`, `pet_interaction`, `owner_interaction`, `before_after`, `problem`, `comfort`, `cta`.
- Planner rejects identical framing back-to-back (compare crop+motion hash).

### 3. Advanced Motion System
- New `remotion/src/motion/` directory with motion primitives: `pushIn`, `whipPan`, `parallaxLayers`, `rackFocus`, `cropShift`, `speedRamp`, `handheldJitter`, `motionBlurTransition`.
- Each scene assigned 1 primary + 1 secondary motion (no repeat in adjacent scenes).

### 4. Short-Form Retention Editing
- Scene timing planner: scene 1 = 1.0–1.5s hook, scenes 2–N = 1.5–2.5s with pattern interrupts.
- Caption timing follows scene cuts; CTA escalation in final 3s.
- Reject scenes >2.5s in plan validation.

### 5. AI Hook Engine
- New edge function `cinematic-ad-hook-generator` calling Lovable AI (google/gemini-3-flash-preview) to produce 3 hook variants from 10 hook types, pick highest scoring.
- Stored on `cinematic_ad_jobs.hook_text` + `hook_type`.

### 6. Pinterest/TikTok Style Matching
- Style preset table `cinematic_ad_style_presets` (pinterest_native, tiktok_native) with pacing JSON.
- Scene planner consumes preset to drive cut density + caption cadence.

### 7. Scene Uniqueness Engine
- Pre-render: compute hash per scene (crop bbox + motion type + caption text).
- Reject plan if any 2 scenes share hash; regenerate up to 3 times.
- Store entropy score on job (`scene_entropy_score`).

### 8. Smart Asset Expansion
- New `remotion/src/lib/assetExpansion.ts`: from 1 source image, derive synthetic variants via crop regions (center, top-detail, bottom-detail, left-third, right-third) + zoom levels.
- Use these as distinct "scenes" when product has <3 images.

### 9. Quality-First QA Engine
- Extend `cinematic-ad-validate` with new dimensions: `mobile_readability`, `caption_visibility`, `hook_strength`, `pacing_quality`, `motion_diversity`, `scene_diversity`, `visual_energy`, `retention_likelihood`, `cta_clarity` (each 0–100).
- Auto-reject if `motion_diversity < 40` OR `scene_diversity < 40` OR `caption_visibility < 70`.

### 10. Creative DNA Memory
- New table `cinematic_creative_dna` storing structure fingerprint + performance metrics (pinterest_saves, clicks, retention, ctr).
- Edge function `cinematic-ad-dna-bias` returns top-3 winning DNA patterns; planner samples from these 70% of the time.

### Database migrations (additive)
- ADD columns to `cinematic_ad_jobs`: `hook_text TEXT`, `hook_type TEXT`, `scene_entropy_score NUMERIC`, `motion_diversity_score NUMERIC`, `caption_visibility_score NUMERIC`, `style_preset TEXT DEFAULT 'pinterest_native'`, `scene_plan JSONB`.
- CREATE `cinematic_ad_style_presets` (preset_name, pacing_config, caption_config, motion_config).
- CREATE `cinematic_creative_dna` (id, dna_fingerprint, scene_sequence, motion_sequence, hook_type, performance JSONB, sample_count, score).
- Seed 2 style presets and the hook taxonomy.

### Files (new/edited)
- New: `remotion/src/lib/safeZone.ts`, `remotion/src/components/SafeZoneFrame.tsx`, `remotion/src/components/SafeCaption.tsx`, `remotion/src/motion/*.ts`, `remotion/src/lib/assetExpansion.ts`
- Edited: `remotion/scripts/render-cinematic-ad.mjs` (planner + scene loop)
- New edge functions: `cinematic-ad-hook-generator/index.ts`, `cinematic-ad-dna-bias/index.ts`
- Edited: `supabase/functions/cinematic-ad-validate/index.ts`
- New migration with all schema additions + seeds
- New admin UI card: `src/components/admin/cinematic/CreativeDNAPanel.tsx` mounted into `CinematicAdsControlCenterPage`

### Safety
- All migrations additive; no drops.
- All new fields nullable with defaults.
- Existing render path remains operational; new planner activated behind `engine_version='v2'` flag on `cinematic_ad_settings` (defaults to v2 but can fall back to v1).
- QA auto-reject only blocks publish; does not delete jobs.

Reply **go** to execute.

## Cinematic Ads Autopilot V3 — Production Hardening Plan

This is a large, multi-system overhaul. I'll ship it in coordinated additive passes — no breaking removals, all gated behind `engine_version='v3'` on `cinematic_ad_settings` with safe fallback to v2.

### 1. Safe Area Engine (hard validator)
- Extend `remotion/src/lib/safeZone.ts` with `safeAreaValidator(caption, fontSize, lineCount)` → returns `{ ok, fixedText, fixedFontSize, fixedY }`.
- Caption auto-shortens (truncate to 2 lines max), auto-scales font (binary search), auto-repositions away from subject bbox.
- Enforce: top margin ≥12%, bottom CTA margin ≥15%, side 6%.
- Pre-render `validateScenePlanCaptions()` rewrites any unsafe caption — never fails render.

### 2. Cinematic Motion Engine v2
- New `remotion/src/motion/` primitives: `dollyIn`, `dollyOut`, `parallaxLayers`, `depthBlurPulse`, `kineticType`, `speedRamp`, `lightingPulse`, `floatingParticles`, `animatedMask`, `crossFadeMotion`.
- Each scene gets `{ primary, secondary }` motion pair; planner rejects any static scene >2s.
- Motion intensity curve: hook=high, problem=medium, benefit=high, cta=ramp-up.

### 3. Scene Uniqueness AI
- `SceneUniquenessAI`: hash by `crop|motion|caption-shape|imageIndex|zoom-bucket`; reject any plan with duplicates; mutate zoom/crop until unique (max 5 attempts).
- Enforce story arc: HOOK → PROBLEM → EMOTION → FEATURE → BENEFIT → PROOF → CTA (7 scenes minimum, 9 ideal).

### 4. AI Storyboard Planner
- New edge function `cinematic-ad-storyboard` calls Lovable AI (gemini-3-flash-preview) to produce:
  - 5 hook variants (pick best by hook-strength heuristic)
  - per-scene caption (≤6 words)
  - pacing map (frame budget per scene)
  - emotional curve
- Stored on `cinematic_ad_jobs.storyboard` JSONB.

### 5. Conversion Psychology Layer
- Storyboard prompt injects: curiosity gaps, pain amplification, pattern interrupts, before/after, urgency CTA.
- Hook taxonomy expanded to 12 types (question, shock, payoff, social_proof, transformation, urgency, curiosity, problem_call_out, relief, comparison, emotion, command).

### 6. QA v3 — Advanced Creative QA
- Update `cinematic-ad-validate`:
  - New auto-thresholds: ≥55 = auto-approve+publish, 40–54 = auto-repair, <40 = quarantine asset (NOT full job).
  - `needs_admin_review` ONLY for: corrupted MP4, render crash, missing assets, moderation flag.
- Wire `cinematic-ad-auto-approve` to use new thresholds.

### 7. Self-Healing Render Orchestrator
- Update `cinematic-ad-watchdog`: structured 5-step recovery ladder
  1. retry simplified transitions
  2. reduce concurrency/memory
  3. swap problematic asset (from QA telemetry)
  4. rebuild scene timing (regenerate plan)
  5. fallback render mode (`render_mode='safe'`)
- Hard cap 5 attempts; quarantine asset on persistent failure, never the job.

### 8. FFmpeg Exit 234 Fix — preRenderMediaValidation
- New `remotion/src/lib/preRenderValidator.mjs`:
  - probe every asset (ffprobe), validate dimensions divisible by 2, normalize to 1080×1920, normalize fps to 30
  - convert unsupported formats (gif/heic/avif → png)
  - reject corrupt assets → request replacement via `cinematic-ad-asset-swap` edge fn
  - estimate frame memory; throttle concurrency when high
- Called from `render-cinematic-ad.mjs` BEFORE composition build.

### 9. Pinterest Publishing Engine (reliable)
- Update/create `cinematic-pinterest-autopublish` edge fn:
  - auto-generate SEO title (hook + product), description (benefit-led, 200 char), 8 hashtags, board match by category, destination URL with UTM
  - max 2 retries with structured error logging
  - publish only when: status='completed' AND mp4 valid AND qa≥55 AND validation_passed AND not duplicate pin
- Pin title library: emotional + searchable variants stored in `cinematic_pin_title_templates` table.

### 10. Creative DNA Learning
- Activate `cinematic-ad-dna-bias`: nightly cron pulls Pinterest analytics (saves, outbound clicks, impressions) into `cinematic_creative_dna.performance`.
- Bias planner: 70% sample from top-3 DNA, 30% explore.

### 11. Admin UI Enhancements
- `CinematicAdsControlCenterPage` adds tabs/sections:
  - Render Log Live (subscribe to `cinematic_ad_render_logs`)
  - Scene Timeline preview (renders `scene_plan` as horizontal track)
  - Motion Diagnostics card
  - Duplicate Detection viewer
  - Safe-area Overlay toggle on preview
  - Pinterest Publish Log
  - QA Breakdown drilldown
  - One-click "Rerender with new storyboard" button
- Mobile responsive throughout.

### 12. Database (additive migration)
- `cinematic_ad_jobs` adds: `storyboard JSONB`, `hook_variants JSONB`, `render_mode TEXT DEFAULT 'standard'`, `quarantined_assets JSONB DEFAULT '[]'`, `pin_publish_attempts INT DEFAULT 0`, `pin_last_error TEXT`.
- New tables: `cinematic_pin_title_templates`, `cinematic_ad_render_logs` (live tail).
- `cinematic_ad_settings`: add `engine_version` ('v3' default), `auto_approve_threshold` (55), `auto_repair_threshold` (40), `max_render_attempts` (5).
- RLS: admin-only writes, service-role full access.

### 13. Files (new/edited)
- New: `remotion/src/lib/preRenderValidator.mjs`, `remotion/src/motion/index.ts` (10 primitives), `supabase/functions/cinematic-ad-storyboard/index.ts`, `supabase/functions/cinematic-ad-asset-swap/index.ts`, `supabase/functions/cinematic-pinterest-autopublish/index.ts`, `src/components/admin/cinematic/RenderLogLive.tsx`, `SceneTimelinePreview.tsx`, `PinterestPublishLog.tsx`.
- Edited: `remotion/src/lib/safeZone.ts`, `remotion/src/lib/scenePlanner.ts`, `remotion/scripts/render-cinematic-ad.mjs`, `supabase/functions/cinematic-ad-validate/index.ts`, `cinematic-ad-watchdog/index.ts`, `cinematic-ad-auto-approve/index.ts`, `src/pages/admin/CinematicAdsControlCenterPage.tsx`.
- New migration with all schema + seeds.

### Safety
- All additive — no drops, all new fields nullable with defaults.
- v3 gated behind `engine_version`; v2 remains operational on fallback.
- QA auto-quarantine flags assets, never deletes jobs.
- Pinterest publish guarded by 4-check gate.

### Self-test
- After deploy: invoke `cinematic-ad-watchdog --force`, verify dashboard counters move (recovered/redispatched/quarantined), then call `cinematic-ad-auto-approve --dry` and report.

Reply **go** to execute.

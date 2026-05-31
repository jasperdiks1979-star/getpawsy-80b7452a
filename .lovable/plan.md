# Phase 2 — Creative Domination: Output Quality Engines

Focus shifts from rejecting to *producing*. No new QA reject rules in this phase. Three new engines that upgrade what we ship before the V7 gate even sees it.

## 1. Cinematic Motion Engine (`cinematic-motion-engine`)

**Purpose:** turn 1–N still product images into a true commercial-style storyboard with ≥70% motion scenes.

New edge function `supabase/functions/cinematic-motion-engine/index.ts`:
- Input: `job_id`, source images (from `cinematic_ad_jobs.source_assets`), product category, hook script.
- Output: `motion_storyboard jsonb` written back to `cinematic_ad_jobs`, structured per scene:
  - `scene_index`, `duration_ms`, `camera_move` (push_in, pull_out, orbit, dolly, crane, handheld_follow, rack_focus_pull)
  - `layers`: `[ {role: background, src, blur, parallax_amp}, {role: midground, src, scale_anim}, {role: subject, src, tracking_path} ]`
  - `depth_simulation`: parallax delta + simulated DoF blur per layer
  - `transition_in/out`: match_cut, whip_pan, light_leak, cross_dissolve, speed_ramp
  - `grading`: LUT name + contrast/saturation/temperature deltas (teal_orange, warm_film, pinterest_premium, kodak_portra)
  - `subject_tracking_path`: bezier keyframes for fake camera-follow
- Heuristics + Gemini call (`google/gemini-3-flash-preview`) for narrative ordering and camera-move choice based on category (cat trees → orbit + crane; litter → push-in macro + rack focus; beds → handheld dolly + warm grading).
- Enforces `motion_ratio ≥ 0.70` (motion scenes / total scenes). If single image, auto-generates 5 sub-shots via crops + depth maps (uses existing `MotionGenerator`/`ParallaxStack` building blocks in `remotion/src/viralShared.tsx`).
- Writes `motion_engine_version='v1'` and `motion_ratio` to job for observability.

## 2. Pinterest Performance Engine (`cinematic-pinterest-perf`)

**Purpose:** predict ad performance *before* render, score 0–100 per axis.

New edge function `supabase/functions/cinematic-pinterest-perf/index.ts`:
- Input: hook variants from `cinematic-hook-engine`, motion storyboard, voice candidate, product metadata.
- Output: `pinterest_perf_scores jsonb`:
  - `stop_scroll` (first-frame visual disruption: motion intensity in frames 0-15, color contrast, face/eyes presence, text-overlay weight)
  - `retention` (predicted % through 6s — based on scene cadence < 1.5s, motion ratio, audio rhythm)
  - `save_rate` (utility + aspirational signals: category × emotional payoff)
  - `ctr` (CTA clarity + price visibility + curiosity gap)
  - `composite` weighted (stop_scroll 0.35, retention 0.25, save_rate 0.20, ctr 0.20)
- Heuristic scoring (deterministic, no AI cost) + optional Gemini second-opinion when composite is borderline 70–85.
- Writes `pinterest_perf_score` (int) and `pinterest_perf_breakdown` (jsonb) to job. Used as input weight to final creative score, **does not block** — informational + ranking only.

## 3. Premium Voice Selector (`cinematic-voice-selector`)

**Purpose:** auto-pick the best US-native voice per product. Replaces manual `VoiceStyleSelector` default.

New edge function `supabase/functions/cinematic-voice-selector/index.ts`:
- Input: product category, target demographic (inferred), hook tone, emotional payoff label, purchase intent (price tier).
- Catalog of US-native premium voices (extends existing `VOICE_STYLE_OPTIONS`):
  - `premium_female_warm` — lifestyle, beds, grooming, mid-high intent
  - `premium_female_aspirational` — cat trees, furniture, high intent
  - `premium_male_trust` — health, safety, training, high intent
  - `friendly_pet_parent_female` — toys, treats, low-mid intent
  - `energetic_social_male` — fast hooks, viral curiosity
  - `documentary_calm_male` — orthopedic, senior pets, high consideration
- Scoring matrix (category × emotion × intent × tone → voice fit 0–100). Picks top 1 + alt.
- Writes `selected_voice_id`, `voice_fit_score`, `voice_alt_id` to job. The existing `cinematic-voice-engine` keeps scoring; selector consumes it.
- Frontend `VoiceStyleSelector` gets an "Auto (recommended)" pill that shows the picked voice + reason.

## 4. Wire-up

- `cinematic-ad-prepare` (or wherever storyboard is built) calls in order:
  1. `cinematic-hook-engine` (existing)
  2. `cinematic-voice-selector` (new)
  3. `cinematic-motion-engine` (new)
  4. `cinematic-pinterest-perf` (new)
  5. Then render.
- `cinematic-ad-validate` reads `motion_ratio` and `pinterest_perf_score` for the score card but **does not add new reject rules**. Composite final score formula gains a small Pinterest-perf weight (5–10%), V7 hard rejects unchanged.

## 5. Database (single additive migration)

Add to `cinematic_ad_jobs`:
- `motion_storyboard jsonb`
- `motion_ratio numeric(4,3)`
- `motion_engine_version text`
- `pinterest_perf_score int`
- `pinterest_perf_breakdown jsonb`
- `selected_voice_id text`
- `voice_fit_score int`
- `voice_alt_id text`

No destructive changes. All nullable. RLS/grants inherit existing table policy.

## 6. Admin UI

Extend `DominationScoreCard.tsx` columns:
- "Motion %" (target ≥70)
- "Pinterest Perf" (0–100, color-coded)
- "Voice" (picked voice id + fit score, click → swap to alt)

Add "Re-plan creative" button per job → re-runs the four-engine pipeline without rendering.

## Out of scope (explicit)
- No new V7 reject rules.
- No render-pipeline rewrite (Remotion compositions unchanged — they already accept richer storyboards).
- No audio engine, no music selection (next phase).
- No bulk regenerate of existing jobs (already covered by `cinematic-ad-rescore-bulk`).

## Risk
- Additive migration only, reversible.
- 3 new edge functions, 1 small validate-function tweak, 1 admin card edit, 1 frontend selector tweak.
- AI cost: Gemini Flash on hook + storyboard ordering + borderline perf → ~$0.0005 / job.
- No expensive APIs touched.

## Deliverable after approval
Three engines deployed, prepare pipeline wired, admin card showing the new fields, one fixture job re-planned end-to-end to prove the storyboard now contains parallax, rack focus, and a graded scene.

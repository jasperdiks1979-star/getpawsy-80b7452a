# Creative Domination V3 — Output Quality Maximum

Goal shift: stop adding QA gates. Upgrade what the pipeline *produces* before render so videos look like premium US agency commercials. No new reject rules, no new scorecards beyond what already exists. The existing V7 + Domination scorers stay, but they're inputs to **auto-regeneration**, not new approval gates.

## 1. Cinematic Motion Engine V2 (`cinematic-motion-engine` rewrite)

Replace the v1 storyboard generator with a stricter planner that guarantees commercial-grade shot variety.

- **Hard plan rules** (planner-side, not validator-side):
  - ≥ 6 scenes, motion_ratio ≥ 0.70, ≤ 30% static scenes
  - ≥ 4 distinct camera styles from: `dolly_in, dolly_out, push_in, pull_out, orbit, tracking, reveal, rack_focus, handheld, parallax_dynamic, shake_natural`
  - ≥ 3 shot distances from: `wide, medium, close_up, extreme_close_up`
  - Must include: 1 lifestyle scene + 1 product demonstration scene
- Forbidden plans: all-Ken-Burns, all-static, single-shot-distance. Planner regenerates internally up to 3x if it produces a forbidden plan (no DB roundtrip).
- For 1-image inputs: auto-derive 6 sub-shots via crop windows + simulated depth (reuses `MotionGenerator` / `ParallaxStack` already in `remotion/src/viralShared.tsx`).
- Adds `foreground_motion`, `background_motion`, `depth_layers`, `subject_isolation`, `dof_blur_px`, `grade_lut` per scene.
- Writes `motion_engine_version='v2'` + a compact `motion_plan_summary` (camera styles used, shot distances used, motion_ratio, lifestyle_present, demo_present) to the job for the admin card.

## 2. Hook Elector (extend `cinematic-hook-engine`)

- Generate **10** hooks (currently 4) across 7 angles: curiosity, transformation, relief, before_after, problem_solution, hidden_benefit, emotional_payoff.
- Score each on: stop_scroll, curiosity_gap, emotion, purchase_intent, save_prob, ctr_pred (existing `scoreHook` extended).
- Elect the top hook + 2 alternates. Write `hook_candidates jsonb` and `hook_winner_reason text` for transparency.

## 3. US Commercial Voice Engine (extend `cinematic-voice-selector` + `cinematic-voice-engine`)

- Generate 5 voice candidates per job (already partly done). Score on trust, warmth, authenticity, purchase_intent, premium_feel.
- Add tags: `native_us_english`, `natural_pacing`, `conversational`, `emotional_variation`. Penalize robotic/monotone/salesy candidates in the score.
- Winner + alt persisted (already partially wired). No DB schema change beyond what's already in place.

## 4. Emotional Story Arc Composer (`cinematic-story-arc` — NEW)

New tiny edge function that produces a 6-beat narrative spine consumed by Motion V2 + hook elector:

1. Problem → 2. Frustration → 3. Discovery → 4. Solution → 5. Emotional payoff → 6. CTA

- Input: product, category, hook winner, voice winner.
- Output: `story_arc jsonb` with one beat per scene index, each carrying `caption_intent`, `emotion`, `visual_intent`.
- Motion V2 reads `story_arc` to assign camera moves per beat (e.g. problem → push_in handheld, discovery → reveal, payoff → orbit + warm grade, CTA → static hero).
- Replaces the current loose "hook → scenes" mapping. No new reject rule; if arc is missing the planner falls back to category default.

## 5. Text Safety (planner-side, not new validator)

Motion V2 enforces:
- ≤ 8 words per text block, ≤ 2 lines per scene
- All captions routed through existing `safeAreaValidator` in `remotion/src/lib/safeZone.ts` (already mobile-safe, Pinterest safe-zone aware)
- No new code path; just a planner-level word-count cap so we never *generate* unsafe text in the first place

## 6. Auto-Regeneration (≤ 2 retries)

Replaces the current "wait for admin confirm" flow with an automatic loop for *clearly weak* outputs only. Admin confirm still required for hard V7 rejects (unchanged).

Trigger conditions (any one):
- `motion_ratio < 0.70`
- camera_styles_used < 4 OR shot_distances_used < 3
- `hook_score < min_hook_score` (existing threshold)
- `pinterest_perf_score < 60`
- `creative_score < 80`

Action:
- `cinematic-ad-regenerate` (existing) gets a `mode: 'auto'` branch. Bumps `regenerate_count` (existing column, hard cap 2). Re-runs hook elector → story arc → motion v2 → render. Skips if `regenerate_count >= 2`. Logs reason in `regenerate_reason text`.

## 7. Admin UI

Tiny additions to `DominationScoreCard.tsx`:
- New column **Plan Quality**: shows `camera_styles_used / shot_distances_used / motion_ratio` as a compact triple.
- New column **Story Arc**: ✓ / ✗ presence indicator.
- New column **Auto-regens**: `regenerate_count / 2`.
- Existing "Re-plan creative" button gains a "Re-plan + re-render (auto)" variant.

No new threshold sliders — Domination thresholds already exist.

## 8. Database (single additive migration)

Add to `cinematic_ad_jobs`:
- `hook_candidates jsonb`
- `hook_winner_reason text`
- `story_arc jsonb`
- `motion_plan_summary jsonb`
- `regenerate_reason text`

All nullable. Inherit existing RLS/grants.

## Out of scope (explicit)

- No new V7 reject rules.
- No new scorecards beyond columns above.
- No render-pipeline rewrite — Remotion compositions already consume richer storyboards.
- No music/audio engine (next phase).
- No bulk auto-regenerate of historical jobs (still manual via existing `cinematic-ad-rescore-bulk`).

## Risk

- 1 additive migration, reversible.
- 1 new edge function (`cinematic-story-arc`).
- Rewrites: `cinematic-motion-engine` (planner stricter), `cinematic-hook-engine` (10 hooks).
- Small edits: `cinematic-voice-selector`, `cinematic-ad-regenerate` (auto branch), `DominationScoreCard.tsx`.
- AI cost: ~$0.0008/job (10 hooks + arc + planner).

## Deliverable after approval

Motion V2 planner live with hard shot-variety rules, 10-hook elector picking winners with reasons, story arc threading 6 beats through the storyboard, auto-regen loop (≤2 retries) triggering on weak outputs, admin card showing plan quality + arc + regen count. One fixture job re-planned end-to-end to prove the new plan contains ≥4 camera styles, ≥3 shot distances, lifestyle + demo, and a complete 6-beat arc.

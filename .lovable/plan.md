## Root cause (confirmed by code + DB inspection)

There are **four stacked bypasses** that funnel every ad into the ffmpeg zoompan slideshow path:

1. `cinematic-ad-prepare` invokes `cinematic-motion-engine` only on the *first* prepare call. In Director mode (`director_run_id` set), prepare hits the idempotent-attach branch at `supabase/functions/cinematic-ad-prepare/index.ts:677` and returns early — the motion-engine call at line 1106 is never reached. Result for every concept in the audited run: `motion_storyboard = NULL`, `motion_engine_version = NULL`.
2. Even if motion-engine ran, `cinematic-ad-claim-job` does not include `motion_storyboard`, `content_type`, or `engine_version` in the worker payload (`supabase/functions/cinematic-ad-claim-job/index.ts:175-223`). The worker sees `undefined`.
3. Render worker dispatch (`remotion/scripts/render-cinematic-ad.mjs:457-483`) gates Remotion behind `REMOTION_TYPES.has(content_type) || hasMotionStoryboard`. Both are false ⇒ falls through to the ffmpeg ken-burns/zoompan slideshow at lines 609-665. Even when Remotion *is* dispatched, if it exits non-zero it silently falls back to the same ffmpeg slideshow (line 482).
4. `cinematic-ad-render-webhook` has no `motion_score` publish gate. Output with `motion_score=0.21` was accepted as `awaiting_approval`.

**Expected path:** prepare → ensure motion-engine wrote ≥6 scenes with motion_ratio ≥ 0.7 → queue → claim-job forwards `motion_storyboard` + `engine_version` → worker dispatches `render-cinematic-remotion.mjs` (real parallax/camera moves/transitions) → webhook records `motion_score`, `transition_count`, `motion_engine_used`; rejects when `motion_score < 0.5`.

## Fix scope

Per your constraint — do not touch queue concurrency / watchdog / retry / Remotion render mechanics. I'll modify only the activation gates, payload pass-through, dispatch decision, validation gate, and admin diagnostics.

### 1. Migration (additive)
Add diagnostic columns to `cinematic_ad_jobs`:
- `motion_engine_used text` (e.g. `v2`, `none`)
- `transition_count integer`
- `motion_diversity_v2 numeric` (parallel to existing `motion_diversity_score`, written by webhook from worker payload)

### 2. `supabase/functions/cinematic-ad-prepare/index.ts`
- Extract the motion-engine invocation into a helper `ensureMotionStoryboard(jobId)`.
- Call it **before** every `return` path that exits with a prepared/attached job (including the Director idempotent-attach branch at line 677 and the main success branch at line 1102).
- Make it **hard-required for `engine_version >= 'v3'`** (which is the project-wide default): await the response; if `ok=false` OR `motion_ratio < 0.7` OR `scene_count < 6`, mark the job `concept_failed` with `error_code='MOTION_ENGINE_FAILED'` and a clear status_message, and return failure to the caller. No silent swallow.
- Persist `motion_engine_used`, `motion_engine_version`, `motion_storyboard`, `motion_ratio` (already done by the engine), plus `transition_count` derived from storyboard transitions.

### 3. `supabase/functions/cinematic-ad-claim-job/index.ts`
- Extend the RPC SELECT (and the payload constructor at line 175-223) to include `motion_storyboard`, `motion_engine_version`, `engine_version`, `content_type`.
- This is a payload pass-through change only — no queue logic, no concurrency, no watchdog touched.

### 4. `remotion/scripts/render-cinematic-ad.mjs`
- Replace the silent-fallback dispatch (lines 443-483) with a hard gate:
  - If `engine_version >= 'v3'` (default now) and `!hasMotionStoryboard`: post webhook `status=failed`, `error_code=MOTION_ENGINE_REQUIRED`, exit.
  - If Remotion is dispatched and exits non-zero: post webhook `status=failed`, `error_code=REMOTION_RENDER_FAILED` (include exit code + last log tail), exit. **Do not** fall back to ffmpeg.
  - The ffmpeg zoompan path remains in the file but is now unreachable for v3 jobs (kept for legacy `engine_version<v3` if any exist).

### 5. `supabase/functions/cinematic-ad-render-webhook/index.ts`
- On `status=uploaded`, write through `motion_engine_used`, `motion_diversity_v2`, `transition_count` from the worker payload.
- Publish gate: if `motion_score < 0.5`, set `status='needs_admin_review'`, `publish_blocked_reason='motion_score_below_0.5'`, and refuse autopublish. (Stacks on top of existing v4/v5 gates.)

### 6. `cinematic-ad-render-webhook` worker payload
- Worker (`render-cinematic-remotion.mjs`) already emits a richer scene_plan from the real motion storyboard; webhook persists it. Add the three new diagnostic fields.

### 7. Admin UI — `src/pages/admin/PinterestAdStudio.tsx` (and the per-job preview row in `CinematicAdsPage` job table)
- Add a "Motion" diagnostic chip strip per concept row showing:
  - `render_mode`
  - `motion_engine_used` (`v2` / `none`)
  - `motion_diversity` (from motion_plan_summary or motion_diversity_v2)
  - `motion_score`
  - `transition_count`
- Red badge when `motion_engine_used='none'` or `motion_score<0.5`.

## Files touched (7)

```
supabase/migrations/<ts>_motion_engine_enforcement.sql       (new)
supabase/functions/cinematic-ad-prepare/index.ts             (motion-engine = hard required; call on both branches)
supabase/functions/cinematic-ad-claim-job/index.ts           (pass motion_storyboard + engine_version to worker)
supabase/functions/cinematic-ad-render-webhook/index.ts      (persist diagnostics; publish gate on motion_score<0.5)
remotion/scripts/render-cinematic-ad.mjs                     (remove silent fallbacks; hard FAIL when motion engine missing or remotion crashes)
src/pages/admin/PinterestAdStudio.tsx                        (motion diagnostic chips per concept)
src/pages/admin/CinematicAdsPage.tsx                         (same chips in the master job list)
```

## Untouched (per your constraint)

- `cinematic-ad-queue-render` (concurrency, queue_waiting, queue_limit)
- `cinematic-ad-watchdog`
- retry & promotion logic
- `render-cinematic-remotion.mjs` rendering internals (only its activation gate in `render-cinematic-ad.mjs` is hardened)

## Verification after deploy

1. New 4-concept director run on `interactive-rolling-cat-ball`.
2. Expect each concept row to show `motion_engine_used=v2`, `motion_ratio ≥ 0.7`, `motion_storyboard.length ≥ 6` before queue.
3. Expect the rendered MP4 row to show `motion_score > 0.7`, `transition_count > 0`, `render_mode≠standard`.
4. Force a failure case: temporarily break the motion-engine fetch and confirm the concept is marked `concept_failed` with `MOTION_ENGINE_FAILED` instead of silently producing a slideshow.
5. Confirm a job with `motion_score=0.3` lands in `needs_admin_review` with `publish_blocked_reason=motion_score_below_0.5`.

## Before / after

| | Before | After |
|---|---|---|
| Dispatch | ffmpeg ken-burns (silent) | Remotion motion engine (enforced) |
| motion_engine_used | `null` for 100% of jobs | `v2` for 100% of v3 jobs |
| motion_score (typical) | 0.21 | > 0.7 |
| motion_storyboard | `null` | ≥ 6 scenes, motion_ratio ≥ 0.7 |
| Failure mode | silent slideshow + `awaiting_approval` | `concept_failed` w/ explicit error code |
| Publish gate | none | rejected when `motion_score < 0.5` |
| Admin visibility | hidden | per-concept diagnostic chips |

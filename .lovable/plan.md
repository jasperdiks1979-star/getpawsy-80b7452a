## Goal

No concept may ever fail with `EMPTY_STORYBOARD`. Every prepare run must persist a storyboard with ≥6 scenes, using AI when possible and a deterministic fallback when not. Diagnostics must make it obvious why the fallback fired.

## Root cause

`supabase/functions/_shared/creative-kit.ts` returns `fallbackKit(...)` on AI errors, and `fallbackKit` ships with `storyboard: []`. `cinematic-ad-prepare/index.ts` (lines 1144–1158) then short-circuits the job to `concept_failed` because `kit.storyboard.length === 0`. Any time the AI gateway returns malformed JSON or a fallback path is taken, the whole concept dies.

## Changes

### 1. `supabase/functions/_shared/creative-kit.ts`
- Add `buildFallbackStoryboard(productName, productSlug)` returning the exact 6-scene structure: Product hero → Problem → Feature → Benefit → Social proof → CTA (durations 3/4/4/4/4/4, scene 6 `on_screen_text` = `Get yours at GetPawsy.pet`).
- Use it inside `fallbackKit(...)` so the fallback kit is never storyboard-empty.
- In `generateCreativeKit(...)`:
  - On parse success but `storyboard.length === 0`, retry the AI call ONCE with a stricter "must return 6 scenes" reminder.
  - If still empty (or any throw / non-2xx that isn't a hard-fail credit error), fall back to `buildFallbackStoryboard` instead of `[]`.
  - Return a new optional `kit_diagnostics` field: `{ source: "ai" | "ai_retry" | "fallback", scene_count, retry_reason?, upstream_status? }`.

### 2. `supabase/functions/cinematic-ad-prepare/index.ts`
- Remove the "refusing to persist empty storyboard → concept_failed" branch (lines 1144–1158). With change #1 it is unreachable; keep a safety net that calls `buildFallbackStoryboard` inline if `kit.storyboard.length < 6` and logs a warning, never aborting the job.
- Around `generateCreativeKit`, log a single structured diagnostics line BEFORE and AFTER the call:
  - Before: `{ traceId, jobId, concept_name, product_id, product_slug, image_count, video_count, prompt_used: "creative-kit.v1" }`
  - After: `{ traceId, jobId, creative_kit_response_status, storyboard_scene_count, source }`
- Persist diagnostics to the job row as `creative_kit_diagnostics jsonb` (new column, see §4) so the UI can read it back.

### 3. Media-asset validation (before storyboard generation)
- In `cinematic-ad-prepare/index.ts`, where `productImages` / `usable_media` are computed, if `images.length === 0` AND no usable_media, force `heroUrl` to the product `image_url` and push a `mediaWarnings` entry `"no_extracted_media_fallback_to_featured"`. Never throw — generation continues with the featured image as the only source.

### 4. Migration
- `ALTER TABLE public.cinematic_ad_jobs ADD COLUMN IF NOT EXISTS creative_kit_diagnostics jsonb;` (no GRANT changes needed — table already has them).

### 5. `src/pages/admin/PinterestAdStudio.tsx` — Debug Director Run panel
- In the existing "Debug Director Run" section, render four new chips per job:
  - `image_count` (from `job.product_lock.image_count`)
  - `video_count` (from `job.product_lock.video_count` if present, else 0)
  - `storyboard_scene_count` (`job.storyboard?.length ?? 0`)
  - `creative_kit_response_status` (`job.creative_kit_diagnostics?.source ?? "unknown"`)
- Color the storyboard chip amber when source is `fallback`, green when `ai`, neutral otherwise.

### 6. Spot-check product
- After deploy, run a dry-run prepare against `GetPawsy Expandable Pet Carrier Backpack` (slug `expandable-pet-carrier-backpack-breathable`, id `0381585e-...`) and verify the diagnostics row shows `source: "ai"` and `storyboard_scene_count: 6`. If `source: "fallback"`, the diagnostics will now expose which step failed; address that follow-up separately.

## Tests
- Extend `supabase/functions/_shared/creative-kit_test.ts` (create if absent) with three cases:
  - AI returns valid 6-scene JSON → `source: "ai"`, 6 scenes.
  - AI returns valid JSON but `storyboard: []` → retry path → `source: "ai_retry"` or `"fallback"`, always 6 scenes.
  - AI throws / non-2xx (non-credit) → `source: "fallback"`, 6 scenes, never throws.

## Non-goals
- No changes to render queue, watchdog, or the paid-render override flow.
- Hard-fail behavior on `AI_CREDITS_EXHAUSTED` / `AI_RATE_LIMITED` / `AI_UNAUTHORIZED` stays unchanged — those still mark `concept_failed` with the existing message.

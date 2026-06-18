
## Goal
Replace the two current Pinterest video paths (static `pinterest-video-publisher` Ken Burns + `cinematic-v3/v4/v5` ad jobs) with one **Cinematic V4 engine** that ships 5-scene, multi-image, safe-zone-validated MP4s into `pinterest_video_queue` at `awaiting_review` — no auto-publish.

## Architecture

```text
products + gallery + AI backdrops
        │
        ▼
[cv4-storyboard]  ── 5-beat plan (problem→solution→benefit→lifestyle→cta)
        │
        ▼
[cv4-assets]      ── resolves 3+ unique images; AI-generates lifestyle if gallery thin
        │
        ▼
[cv4-quality-gate-pre]  ── reject if <3 imgs / dup captions / >6 words / unsafe
        │
        ▼
[GH Actions render-cinematic-v4]  ── new Remotion composition `CinematicV4`
        │
        ▼
[cv4-quality-gate-post] ── frame-diff slideshow detection, OCR safe-zone re-check
        │
        ▼
pinterest_video_queue.status = 'awaiting_review'   (publisher already blocks non-pending)
        │
        ▼
Admin review page → Approve → status='pending' → existing drainer publishes
```

## What gets built

### 1. Storyboard builder — `supabase/functions/cv4-storyboard/index.ts`
- Lovable AI (`google/gemini-3-flash-preview`), structured `Output.object`.
- Returns exactly 5 beats: `problem | solution | benefit | lifestyle | cta`.
- Per beat: `caption` (≤6 words, enforced), `duration_frames` (36–75), `image_role` (`product_callout | feature_zoom | lifestyle | benefit_card | cta_card`), `motion` (`pan_left | pan_right | push_in | pull_out | parallax | shake`).
- Persisted to new `cinematic_v4_storyboards` table.

### 2. Asset resolver — `supabase/functions/cv4-assets/index.ts`
- Pulls `products.gallery_images` + `product_media` for the slug.
- If <3 unique images, calls Lovable AI image generation (gemini-3-pro-image-preview) for the missing `lifestyle` / `benefit_card` scenes using a brand-safe prompt template (no AI pets in product role).
- Stores image URLs in `cinematic_v4_storyboards.scene_assets` as `{beat, image_url, source: 'gallery'|'ai'}`.

### 3. Remotion composition — `remotion/src/cinematic-v4/`
- `CinematicV4.tsx` root + 5 scene components (`ProblemScene`, `SolutionScene`, `BenefitScene`, `LifestyleScene`, `CtaScene`).
- `TransitionSeries` between scenes (`fade`, `slide`, `wipe` rotated by beat).
- `safeZone.ts` already exists — caption layout uses `safeAreaValidator()` clamped to Pinterest 9:16 safe area (top 14%, bottom 18% banned).
- Per-scene unique motion via `humanCamera.ts` (already in repo).
- Reads `storyboard` + `scene_assets` from props.

### 4. Pre-render quality gate — `supabase/functions/cv4-quality-gate-pre/index.ts`
Reject reasons (write to `cv4_reject_reasons[]`):
- `scenes_lt_5`, `unique_images_lt_3`, `duplicate_caption`, `caption_over_6_words`, `single_image_detected`, `unsafe_caption_position`.

### 5. Render dispatcher — extend `.github/workflows/render-cinematic-ad.yml`
- Add a `v4` matrix path that mounts the new composition and uploads MP4 to Supabase Storage (`cinematic-v4-renders` bucket).
- On success, edge fn `cv4-finalize` inserts the row into `pinterest_video_queue` with `status='awaiting_review'`, `engine_version='v4'`, `quality_score`, `scene_count`, `unique_image_count`.

### 6. Post-render quality gate — `supabase/functions/cv4-quality-gate-post/index.ts`
- Uses Lovable AI vision on 5 evenly-spaced frames extracted via ffmpeg in GH Actions step.
- Detects: text outside safe zone (OCR bbox), `>0.95` similarity between frame 1 & frame N (slideshow), single image across all frames.
- Fail → `status='creative_rejected'`, never reaches review.

### 7. Publisher guard — patch `pinterest-video-publisher/index.ts`
- Refuse rows where `status != 'pending'` (already done) **and** add: refuse if `engine_version='v4' AND approved_at IS NULL`.

### 8. Review UI — `src/pages/admin/CinematicV4Review.tsx`
Route: `/admin/cinematic-v4-review`.
Shows queue cards with: video player, storyboard beats (caption + thumbnail), scene count, unique image count, quality gate scores, **Approve** / **Reject** buttons.
Approve → flips `status='pending'` and sets `approved_at`. Reject → `creative_rejected`.

### 9. Showcase trigger — `supabase/functions/cv4-generate-showcase/index.ts`
- Selects 5 distinct top-winner slugs across 5 different niches (dog beds, cat trees, cat litter, dog playpen, cat enclosure) from `cj_us_winners`.
- Runs the full pipeline per slug. Returns trace IDs.

## Database changes
```sql
create table public.cinematic_v4_storyboards (
  id uuid primary key default gen_random_uuid(),
  product_slug text not null,
  beats jsonb not null,           -- 5-beat array
  scene_assets jsonb not null,    -- [{beat,image_url,source}]
  hook_archetype text,
  status text not null default 'pending', -- pending|rendering|rendered|rejected
  cv4_reject_reasons text[] default '{}',
  quality_score numeric,
  scene_count int,
  unique_image_count int,
  mp4_url text,
  approved_at timestamptz,
  created_at timestamptz default now()
);
-- GRANTs + RLS (admin-only read/write, service_role all)

alter table public.pinterest_video_queue
  add column if not exists engine_version text,
  add column if not exists approved_at timestamptz,
  add column if not exists storyboard_id uuid references public.cinematic_v4_storyboards(id);
```
Status value `awaiting_review` reused (already supported via free-text column).

## Out of scope this pass
- Music/voiceover (V5 territory; can be additive later).
- Auto-publish — explicitly disabled, every V4 row requires manual Approve.
- Replacing the V3/V5 ad-jobs path for non-Pinterest surfaces (TikTok stays on its own pipeline).
- Retroactive re-render of historical pins.

## Acceptance
- 5 storyboards created, 5 MP4s rendered, all 5 land in `pinterest_video_queue.status='awaiting_review'` with `engine_version='v4'`, `scene_count=5`, `unique_image_count≥3`.
- `/admin/cinematic-v4-review` shows all 5 with playable previews.
- Existing drainer cannot publish any V4 row until `approved_at` is set.
- All captions verified inside safe zone via OCR check; any failures appear as `creative_rejected` instead.

Approve to proceed; I'll ship in this order: DB migration → storyboard fn → assets fn → Remotion composition → GH Actions matrix → review UI → showcase trigger.

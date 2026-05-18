# Cinematic Ad Pipeline — Viral Vertical Rebuild

Goal: every Pinterest/TikTok render is true 1080×1920 motion (no slideshows), with hook typography, mobile-safe zones, dynamic scene composition, preset-driven presets, automated validation, and an admin preview before publish.

## 1. New Remotion composition: `viral-vertical`

File: `remotion/src/MainVideoViralVertical.tsx` + scenes under `remotion/src/scenes/viral/`.

Props-driven (Zod), so one composition serves all presets and any product:
```ts
type ViralProps = {
  preset: 'pin-organic' | 'pin-ads' | 'tt-organic' | 'tt-spark';
  hook: string;          // "I haven't scooped in 3 months"
  subhook?: string;
  cta: string;
  ctaUrl: string;
  product: { name: string; price: string; slug: string };
  media: Array<           // 1..N, mixed
    | { kind:'image'; src:string; focus?:{x:number;y:number}; motion?:'kenburns-in'|'kenburns-out'|'pan-left'|'pan-right'|'parallax' }
    | { kind:'video';  src:string; trimStart?:number; trimEnd?:number }
  >;
  music?: string;
};
```

Scenes (all 1080×1920, all use safe zones 96px top/bottom, 64px sides):
1. `ViralHook` — frame 0-50, hook typography lands in <15 frames (≤0.5s), Ken Burns + colored over­lay.
2. `ViralFeature` (×2-3) — closeup of media item with parallax layers and label chip.
3. `ViralLifestyle` — wide framing with subtle pan + grain.
4. `ViralCTA` — product name, price, big CTA, animated underline, last 3-4s held with micro-motion.

Shared module `remotion/src/viralShared.tsx`:
- `SafeFrame` helper rendering safe-zone guides (only when `?debug=1` URL param).
- `KenBurnsLayer` for any still: detects aspect ratio, picks `cover` fit, animates `scale 1.04→1.18` + `translate` based on `focus`.
- `ParallaxStack` — splits image into 3 z-layers via duplicated `Img` with different `translateY` * frame.
- `MotionGenerator` — when media has only 1 still, auto-builds: zoom-in → cut → pan-right → cut → zoom-out, with crossfades, so it never feels like a slideshow.
- `HookText` — large display font, top-safe, mask-reveal per word using spring stagger.
- `Caption` — bottom-safe word-highlight subtitles.

Registered in `remotion/src/Root.tsx` with `calculateMetadata` for dynamic duration per preset (18s organic, 22s ads).

## 2. Preset registry

`supabase/functions/_shared/cinematic-presets.ts` — single source of truth, reused by edge functions and the React preview UI.

```ts
export const PRESETS = {
  'pin-organic': { width:1080, height:1920, fps:30, durationSec:18, music:'soft', captions:true, ctaHoldFrames:90, brandLogoFromFrame:60 },
  'pin-ads':     { width:1080, height:1920, fps:30, durationSec:22, music:'soft', captions:true, ctaHoldFrames:120, brandLogoFromFrame:0, disclosure:true },
  'tt-organic':  { width:1080, height:1920, fps:30, durationSec:18, music:'energy', captions:true, hookByFrame:24, brandLogoFromFrame:60 },
  'tt-spark':    { width:1080, height:1920, fps:30, durationSec:22, music:'energy', captions:true, hookByFrame:24, brandLogoFromFrame:0, disclosure:true },
};
```

## 3. Edge functions — pipeline changes

- `cinematic-ad-prepare`: accept `preset`, fetch product + up-to-6 source images + any short clips, build `ViralProps`, push to `cinematic_ad_jobs.payload`. If only 1 still, mark `payload.synth_motion=true` so the composition uses `MotionGenerator`.
- `cinematic-ad-queue-render` / `cinematic-ad-dispatch`: pass `compositionId='viral-vertical'` and the resolved preset's `width/height/fps/durationInFrames` to the render worker (GitHub Actions / render-worker), removing any 1:1 or 16:9 fallback paths.
- `cinematic-ad-render-webhook`: on upload, before flipping job to `render_complete`, call new `cinematic-ad-validate`.
- **NEW `cinematic-ad-validate`**: ffprobe the MP4 → assert `width===1080 && height===1920`, no black-bar borders (sample top/bottom row luma via ffmpeg `cropdetect`), duration within ±1s of preset, audio loudness in range, and a **motion score** = average frame-diff over sampled frames (ffmpeg `select='gt(scene,0.0)'` + stat). Threshold defaults: motion_score ≥ 0.012. Stores `validation_report` JSONB on `cinematic_ad_jobs`. If fail → job → `failed_validation` (does not push to Pinterest).
- `cinematic-ad-push-pinterest`: refuses to publish unless `validation_report.passed === true`.

## 4. Database

Migration:
```sql
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN preset text NOT NULL DEFAULT 'pin-organic',
  ADD COLUMN validation_report jsonb,
  ADD COLUMN motion_score numeric,
  ADD COLUMN approved_at timestamptz,
  ADD COLUMN approved_by uuid;
-- new status value handled in app (failed_validation, awaiting_approval)
```

## 5. Admin preview panel

Route: `/admin/cinematic-ads/preview/:jobId` (lazy-loaded under existing admin chunk).

Layout:
- Sticky 9:16 `<video>` player (max-h 70vh) playing the rendered MP4.
- Right column:
  - Validator badges (aspect, black bars, duration, motion score, caption-safety).
  - Per-scene timeline (chips with thumbnails from ffmpeg-extracted frames at scene boundaries) — click to seek.
  - Override controls: change preset, swap hook text, re-queue render for a single scene (calls `cinematic-ad-queue-render` with `regenerateScene:n`).
  - "Approve & Publish" button (disabled until validator passes). Writes `approved_at/by`, then invokes `cinematic-ad-push-pinterest`.

A new column "Preview" in the existing dashboard table opens this panel.

## Technical notes

- Remotion: animations strictly `useCurrentFrame()` + `interpolate`/`spring`. Hook typography uses `@remotion/google-fonts/Inter` (already in deps) + `Bebas Neue` for display.
- Motion synth from single still: 3 ffmpeg-style Ken-Burns sub-clips concatenated inside Remotion (no real ffmpeg call — pure transforms), so it stays one-pass render.
- Validator runs in a Deno edge function using `Deno.Command("ffprobe"…)` if available; render-worker (Node) is the fallback host and posts the report back to a new `cinematic-ad-validation-callback` endpoint.
- Safe zones enforced via shared `SAFE = { top:96, bottom:240, x:64 }` constants; the composition's `?debug=1` flag draws them for QA.
- All new edge functions follow project standard JSON contract `{ok, traceId, message}` and use `npm:@supabase/supabase-js@2.49.1`.

## Files touched

Created:
- `remotion/src/MainVideoViralVertical.tsx`
- `remotion/src/viralShared.tsx`
- `remotion/src/scenes/viral/{Hook,Feature,Lifestyle,CTA}.tsx`
- `supabase/functions/_shared/cinematic-presets.ts`
- `supabase/functions/cinematic-ad-validate/index.ts`
- `supabase/functions/cinematic-ad-validation-callback/index.ts`
- `supabase/migrations/<ts>_cinematic_viral.sql`
- `src/pages/admin/CinematicAdPreviewPage.tsx`
- `src/components/admin/cinematic/{ValidatorBadges,SceneTimeline,OverrideControls}.tsx`

Edited:
- `remotion/src/Root.tsx`
- `supabase/functions/cinematic-ad-{prepare,queue-render,dispatch,render-webhook,push-pinterest}/index.ts`
- `src/pages/admin/CinematicAdsDashboardPage.tsx` (add Preview column + Preset filter)
- `src/App.tsx` (route)

## Out of scope (flagged for later)
- In-browser music volume / image swap editor.
- Auto A/B variant generation across presets.
- TikTok publish endpoint (still manual via link-in-bio per memory).

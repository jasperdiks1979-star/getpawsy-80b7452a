
# Cinematic Video Engine v4 — Video-First Pinterest Pipeline

Builds on the existing `cinematic_ad_*` + `pinterest-content-director` stack. The current engine still ships static posters and backdrop swaps as a meaningful share of output. v4 makes **MP4 the only first-class output**, plugs in AI voice-over, formalizes the 7-beat scene system at the renderer level, and forces real product rotation.

## What's already there (reused, not rebuilt)
- `cinematic_ad_jobs` + storyboard generator (`cinematic-ad-storyboard`, 7-beat arc)
- `pinterest-content-director` (5 archetypes, cooldowns, mix targets 40/20/15/15/10)
- `cinematic-ad-autopublish` quality gate + pHash dedupe + windowed cadence
- Remotion render-worker + `scenePlanner.ts` (motion/crop/zoom diversity)
- Admin: `PinterestContentEnginePanel`, `VerifyPinsPanel`, `VerificationHistoryPanel`

## What changes

### 1. Kill static-first pathway
- `cinematic-ad-autopublish` rejects any job where `output_mp4_url IS NULL` **unless** `content_type='infographic_static'` AND today's static-share < 5%.
- `pinterest-content-director` returns one of: `cinematic_product_demo | compilation | ugc_pov | lifestyle_scene | animated_reel | infographic_static` with target mix **40/25/20/10/0/5**.
- Static posters/backdrop-swap jobs auto-flagged `publish_blocked_reason='static_deprecated'`.

### 2. AI voice-over (ElevenLabs)
- New edge fn `cinematic-voiceover-generate`: takes storyboard beats → produces MP3 per beat, stitched via request-stitching for prosody continuity.
- 6 voice IDs registered in new table `cinematic_voice_profiles` (3 female / 3 male, warm US accent — Sarah, Jessica, Matilda, Brian, Eric, Liam).
- Hook line bank in `cinematic_voiceover_lines` (≥40 seed lines, weighted by archetype).
- Stored on `cinematic_ad_jobs.voiceover_url`, `voiceover_voice_id`, `voiceover_script`.
- Requires `ELEVENLABS_API_KEY` secret (will request if missing).

### 3. Renderer upgrades (`render-worker`)
- New Remotion compositions:
  - `CinematicProductDemo` (15–25s, 7-beat scene system baked in)
  - `CompilationReel` (3–5 products, numbered cards, 25–35s)
  - `UgcPovScene` (POV framing, hand-held wiggle, caption-forward)
  - `LifestyleScene` (AI backdrop + product cutout drift)
- All 9:16 1080×1920, 30fps, smooth cuts via `@remotion/transitions`, motion zooms via existing `scenePlanner`.
- Voice-over track muxed; auto-ducked background music from `cinematic_music_tracks` table; whoosh SFX on cuts from bundled pool.
- Burned-in animated captions synced to voice-over timestamps (TikTok-style word pop, max 4 words/line).

### 4. Product rotation engine
- New view `cinematic_product_rotation_v`: products ranked by `(trending_score * 0.5 + freshness * 0.3 + category_diversity * 0.2)`, excluding any used in last 7 days.
- Director picks from this view; compilations pull 3–5 across **distinct categories** (litter, cat-tree, grooming, feeding, gadgets).
- Hard cap: no single product > 15% of pins in any 14-day window.

### 5. Variation engine
- `cinematic_ad_jobs.variation_signature` = hash(hook_text + voice_id + scene_order + thumbnail_phash + music_track_id).
- Autopublish rejects if signature matches any of last 50 published.

### 6. Admin panel additions
Extend `PinterestContentEnginePanel`:
- Inline `<video controls>` MP4 preview per queue item
- `<audio>` voice-over preview
- Columns: render duration, products used (chips), hook archetype, voice profile, variation_signature short, duplicate score, predicted engagement, cinematic quality score (composite of QA + diversity + voice presence)

### 7. Database migration
```
ALTER TABLE cinematic_ad_jobs ADD COLUMN
  voiceover_url text,
  voiceover_voice_id text,
  voiceover_script jsonb,
  music_track_id uuid,
  variation_signature text,
  cinematic_quality_score numeric;

CREATE TABLE cinematic_voice_profiles (id, voice_id, gender, tone, label, active);
CREATE TABLE cinematic_voiceover_lines (id, archetype, beat, text, weight, active);
CREATE TABLE cinematic_music_tracks (id, url, mood, bpm, license, active);
CREATE VIEW  cinematic_product_rotation_v AS …;

UPDATE cinematic_ad_settings SET
  static_share_cap = 0.05,
  video_share_floor = 0.95,
  voiceover_required = true;
```
Seed: 6 voices, 40+ VO lines, 12 music tracks (royalty-free URLs).

## Files

**New:**
- `supabase/functions/cinematic-voiceover-generate/index.ts`
- `supabase/functions/cinematic-music-pick/index.ts`
- `render-worker/templates/CinematicProductDemo.tsx`
- `render-worker/templates/CompilationReel.tsx`
- `render-worker/templates/UgcPovScene.tsx`
- `render-worker/templates/LifestyleScene.tsx`
- `render-worker/lib/captionBurner.ts`
- `src/components/admin/cinematic/CinematicJobPreview.tsx`
- Migration `2026xxxx_cinematic_video_engine_v4.sql`

**Edited:**
- `supabase/functions/pinterest-content-director/index.ts` (new archetypes, rotation view, static-cap)
- `supabase/functions/cinematic-ad-autopublish/index.ts` (video-first gate, variation_signature check)
- `supabase/functions/cinematic-ad-storyboard/index.ts` (emits VO script per beat)
- `src/components/admin/cinematic/PinterestContentEnginePanel.tsx` (previews + new columns)

## Rollout order
1. Migration + seeds
2. ElevenLabs secret + `cinematic-voiceover-generate`
3. Storyboard emits VO scripts
4. Renderer templates (demo → compilation → UGC → lifestyle)
5. Director archetype mix + rotation view
6. Autopublish video-first + variation gate
7. Admin previews

## Acceptance
- ≥95% of pins published in any rolling 7-day window are MP4
- Every MP4 has voice-over track + burned captions
- No product appears in >15% of pins per 14-day window
- All 4 video archetypes present each week
- No variation_signature repeats within 50 pins
- Admin shows MP4 + VO preview, products, hook, voice, quality score

## Open prerequisite
ElevenLabs requires an API key. I'll request `ELEVENLABS_API_KEY` via the secrets flow before deploying voice-over.

---

This is a sizeable change (4 new renderer templates + 2 edge fns + migration + admin work). Approve and I'll execute in the rollout order above, asking for the ElevenLabs key right before step 2.

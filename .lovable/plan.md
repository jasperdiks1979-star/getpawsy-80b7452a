## V4 → V5 Pivot: Pinterest-Native UGC Story Ads

We're abandoning the "Ken Burns over product photos" approach entirely. V5 produces narrative ad films with a HOOK→PROBLEM→SOLUTION→BENEFIT→CTA arc, AI-generated lifestyle scenes (no raw CJ product shots full-screen), and automatic ElevenLabs voice-over. Nothing publishes — 3 prototypes go straight to `/admin/cinematic-v4-review` for your judgment.

### 1. Story engine (`cv5-storyboard`)

For each product, generate a 5-beat script keyed to the niche (cat toy / litter box / dog bed / etc.):

```text
beat 1  HOOK      0–3s   pattern interrupt, emotional hook line
beat 2  PROBLEM   3–8s   the pain the pet/owner feels today
beat 3  SOLUTION  8–15s  product introduced in real environment
beat 4  BENEFIT  15–22s  outcome: happy pet, calm home, freedom
beat 5  CTA      22–30s  "Tap to see why owners love it"
```

Each beat carries: `scene_prompt` (for image gen), `vo_line` (≤14 words), `on_screen_caption` (≤5 words), `duration_s`, `camera_move`.

Niche-aware beat templates are stored in `cv5_story_templates`. Cat-toy / litter-box / dog-bed templates ship first; fallback = generic pet template.

### 2. Lifestyle scene generation (`cv5-scenes`)

Source product photos are used ONLY as reference for color/shape — never shown full-screen. For each beat we generate a lifestyle image:

- Cat toy: bored cat on couch → cat mid-pounce → cat playing with ball → owner laughing → product hero in living room
- Litter box: dirty corner → frustrated owner with scoop → clean modern setup → cat using box calmly → product in styled bathroom
- Dog bed: restless dog pacing → dog curled asleep → fabric texture macro → cozy living room wide → product styled

Generated via `imagegen` (premium tier for hero beats). Real product shot composited into beats 3 and 5 only, as a small inset / on-shelf element — never the full frame. Saved to `cinematic-ads-v5` storage bucket.

### 3. Voice-over (`cv5-voiceover`)

ElevenLabs required. We call the ElevenLabs connector (will request the standard connector link if missing) to synthesize all 5 vo_lines as MP3, stitched with `previous_text`/`next_text` for prosody continuity. Voice defaults to a warm female US voice (Sarah `EXAVITQu4vr4xnSDxMaL`); cat vs dog niches can swap. Output uploaded to storage; URLs stored on the storyboard row. **A storyboard without a successful voice-over render is hard-blocked from review.**

### 4. Pinterest Quality Score (`cv5-quality-gate`)

Pre-render checks (reject before sending to renderer):

| Check | Reject if |
|---|---|
| white-bg product slides | >20% of beats are raw product cutouts on white |
| infographic detection | any beat image OCR finds >10 words of UI text |
| caption clip | OCR bbox exits 0–86% vertical safe zone or overflows horizontally |
| voice-over | missing, <total_duration−2s, or ElevenLabs error |
| scene variety | fewer than 5 distinct scene types across beats |
| caption length | any caption >5 words |

Pass = `quality_score ≥ 80` AND all hard checks green → status `awaiting_render`. Fail = `creative_rejected` with reason list.

### 5. Renderer update (`render-cinematic-v4.yml` → v5 path)

GitHub Actions workflow renders 1080×1920 @ 30fps. Per beat: lifestyle image with subtle camera move (push-in, parallax, or drift — varied per beat, never identical Ken Burns), captions in safe zone (top 14% & bottom 22% clear), vo_line audio. Final ffmpeg pass muxes the stitched ElevenLabs MP3. Post-render OCR re-check; on clip → mark `upload_failed`, don't auto-pass.

### 6. Review UI (`/admin/cinematic-v4-review`)

Add a V5 tab. Each card shows:
- playable 9:16 MP4
- waveform of voice-over with transcript per beat
- 5 beat thumbnails with captions
- which source images were used (and how — reference only vs composited)
- quality score breakdown (white-bg %, scene variety, OCR results)
- Approve / Reject (with reason)

No auto-publish. Kill switch from previous turn stays on. V5 rows publish only after explicit approval, same gate as V4.

### 7. Prototypes

Generate exactly 3, then stop:
1. Interactive Cat Toy Ball
2. Smart Laser Cat Teaser
3. Memory Foam Pet Bed

Selected via slug match in `products_public`; if a slug isn't found we pick the closest niche match and log it on the card.

### Technical details

**New tables / columns**
- `cv5_storyboards` (product_id, beats jsonb, vo_audio_url, quality_score, quality_breakdown jsonb, status, mp4_url, github_run_id…)
- `cv5_story_templates` (niche, beats jsonb)
- storage bucket `cinematic-ads-v5` (private; signed URLs in UI)
- `pinterest_video_queue.engine_version` already supports values; add `'v5'`

**New edge functions**
- `cv5-storyboard` — picks template, fills beats with Lovable AI
- `cv5-scenes` — generates 5 lifestyle images via imagegen
- `cv5-voiceover` — ElevenLabs synth + upload
- `cv5-quality-gate` — pre-render checks, sets score
- `cv5-queue-render` — dispatches GH workflow (reuses v4 dispatcher pattern incl. run_id capture)
- `cv5-render-callback` — same hardened logic as v4 (distinguishes render failure vs creative reject), additional OCR post-check
- `cv5-generate-prototypes` — orchestrates the 3 prototypes end-to-end

**Connector**
- ElevenLabs standard connector required. If not linked I'll trigger the connect flow before generating voice-over.

**What we do NOT change**
- V4 rows stay frozen, kill switch stays on, existing Pinterest pins untouched.
- No publisher changes; V5 inherits the same approval-gated publish path.

### Order of execution (after you approve)
1. ElevenLabs connector link + storage bucket + tables
2. `cv5-storyboard` + `cv5-scenes` + `cv5-voiceover` + `cv5-quality-gate`
3. Renderer workflow + callback
4. Review UI V5 tab
5. Run `cv5-generate-prototypes` for the 3 SKUs and report back with playable URLs

Approve to proceed, or tell me what to adjust (voice choice, beat timing, niche templates, scene list).

# Pinterest Video Autopilot V4

This is a large, multi-system change. Before I start editing 10+ edge functions and writing migrations, I want to confirm scope so we don't ship something half-wired.

## What I'll build if you approve

### 1. Recovery worker (one-shot, callable from admin)
New edge function `pinterest-video-autopilot-repair`:
- Scans `pinterest_video_queue`, `pinterest_video_assets`, `cinematic_v3_jobs`, `cinematic_ad_jobs`, `cinematic_ad_publish_queue` for statuses: `failed`, `creative_rejected`, `publish_blocked`, `needs_scene_regen`, `draft`, `quarantined`.
- Per record: re-resolves canonical slug via `products.slug` (with UUID→slug fallback already added last turn), rebuilds destination URL `/products/{slug}` with UTM, rehydrates product context (title, description, category, tags, features), regenerates missing voiceover/captions/Pinterest metadata by calling the existing prepare + narrative-guard functions, and re-queues.
- Returns `{repaired, regenerated, ready_for_publish, discarded}`.

### 2. Mode + autopilot flags (single migration / inserts)
- `cinematic_ad_settings.auto_publish_enabled = true`
- `pinterest_video_autopilot_settings.enabled = true`
- `pinterest_pipeline_settings.current_mode = 'normal'`, `emergency_mode_enabled = false`

### 3. Video quality gate (hard reject static/zoom-only)
Extend `cinematic-ad-validate` v4 rules:
- Reject when `scene_change_count < 4` OR `camera_motion_score < 70` OR engine is single-image Ken-Burns.
- Reason codes: `static_image`, `slow_pan`, `slow_zoom`, `slideshow_only`.

### 4. Scene rotation registry
New table `cinematic_scene_environments` seeded with the cat/dog/other lists from your brief. `cinematic-ad-prepare` picks a non-repeating environment per product (rolling window of 5).

### 5. Voiceover rotation
New table `cinematic_voice_rotation_state` tracking last-used voice + consecutive count. ElevenLabs voice pool: Jessica, Emma, Sophie, Olivia, James, Ryan, Michael with 40/40/20 weights and ≤3 consecutive rule. Wired into `cinematic-voiceover-*`.

### 6. Script + hook rotation
Hook bank stored in `cinematic_hook_variants` (already exists). Add hook archetypes: problem, benefit, transformation, curiosity, question, lifestyle, pet_happiness, owner_frustration. Banned-phrase list extended ("Tired of scooping every day", etc.). Narrative-guard rejects on match.

### 7. Caption engine
Hard cap 7 words; safe-zone enforced by existing `AutoFitText` + `SafeZoneFrame`. Add lint in validate step.

### 8. Product-match QA
New shared module `_shared/product-match-qa.ts`: compares voiceover/script/scene tags/category/species against product. Any mismatch → `mismatch_score > 0` → reject + requeue regen. Wired into autopublish gate.

### 9. Pinterest metadata generator
SEO title, description, keywords, board, hashtag cluster, CTA — picked from rotation pool. CTA bank seeded: Shop Now, See Why Pet Parents Love It, Discover The Difference, Upgrade Your Pet's Daily Routine, Give Your Pet More Comfort.

### 10. Autonomous loop
Cron (every 10 min): `pinterest-video-autopilot-tick` — pulls next ready asset, runs QA, publishes via existing `pinterest-video-publisher`, logs, advances. Respects daily cap (30 target) and 90-min gap.

### Admin UI
Add "Run Autopilot Recovery" button on `/admin/pinterest-video-queue` returning the 4 counters (repaired / regenerated / ready / discarded).

## What I'm NOT doing automatically
- I will NOT change the rendering engine itself (Remotion v4/v5 stays). The "TikTok ad quality" target requires real video generation (Runway/Veo) — that pipeline already exists in `cinematic_runway_jobs`. I'll route through it but won't rebuild it.
- I will NOT delete existing failed rows; they get repaired in place or marked `discarded` with a reason.

## Questions before I start
1. **Scope of this turn**: this is realistically 8–12 hours of work and ~15 file changes + 2 migrations. Do you want me to ship it all in one go, or land it in phases (Phase A = recovery + flags + UI button; Phase B = rotation engines; Phase C = QA + cron)?
2. **ElevenLabs voice IDs**: you listed names (Jessica, Emma, etc.). Do you already have voice IDs mapped in `cinematic_voice_profiles`, or should I seed defaults from the ElevenLabs public library?
3. **Daily publish cap**: brief says "30+ pins/day" but existing `max_pins_per_day=6` and US-quality memory caps at 10. Override to 30, or keep the safety cap and let it ramp?

## Pinterest Video-First Quality Pivot

Goal: stop static-image duplicate spam, make Pinterest publishing video-first, varied, and US-market native. Build on existing infra (`pinterest-video-publisher`, `pinterest-creative-director`, `cinematic-ad-autopublish`, pHash guard, quarantine engine, recovery tier).

Storefront, GMC, TikTok, SEO: untouched.

### 1. Publish priority gate (new shared module)
New `supabase/functions/_shared/pinterest-publish-priority.ts`:
- `selectBestCreative(productSlug)` returns `{type: 'video'|'slideshow'|'carousel'|'static', assetRef, reason}` in that strict order.
- Sources scanned: `cinematic_ad_jobs.output_mp4_url` (status `ready_to_pin`), `pinterest_video_assets`, then `pinterest_pin_queue` slideshow/carousel drafts, then static last.
- Static only allowed if `allow_static_fallback=true` in `cinematic_ad_settings` AND no video/slideshow available in last 7 days for slug.

### 2. Duplicate prevention (extend existing pHash guard)
- Extend `_shared/pinterest-phash.ts`: add `hashAnyMedia(url)` (works for image OR mp4 thumbnail via ffmpeg-less first-frame fallback through `og:image`).
- `pinterest-video-publisher` and `cinematic-ad-autopublish` both call `assertNotRecentlyPublished({slug, mediaHash, withinDays:30})` against `pinterest_video_publish_log` + `pinterest_pin_queue` (status=`posted`).
- If duplicate → status `failed_duplicate`, log reason, surface in admin.

### 3. Auto-slideshow fallback (new edge fn `cinematic-slideshow-generator`)
When video rendering fails (or no MP4 in 24h for a slug) and product has ≥3 lifestyle images:
- Pick 3–5 images, generate ffmpeg-free animated slideshow via Remotion composition `MainVideoSlideshow` (zoom/pan + 4-word overlay per scene + CTA end frame).
- Outputs MP4 → uploaded to `pinterest-ads/slideshow/{slug}/`.
- Inserted as `cinematic_ad_jobs` row with `render_mode='slideshow'`, status `ready_to_pin`.

### 4. Hook + overlay rotation
Extend `_shared/pinterest-video-meta.ts` and `cinematic-ad-storyboard`:
- New hook archetypes: `problem_solution`, `cat_reaction`, `before_after`, `smart_home`, `pet_parent_relief`, `viral_tiktok`, `pov`, `wish_sooner`.
- Overlay pool (3–6 words): "No more litter smell", "Cats actually love this", "Worth every penny", "Self-cleaning = game changer", "Best upgrade for cat parents", etc. — stored in `cinematic_humanization_pools` with `pool_type='overlay_short'`.
- `hook_archetype` cooldown already enforced (7d, memory) — extend selector to pick least-recently-used per slug.

### 5. Pinterest metadata generator
Update `_shared/pinterest-video-meta.ts`:
- Title (40–100 chars), description (US English, no CJ phrases, sanitized via `merchant-policy.ts`), 4–6 hashtags from niche taxonomy, CTA from rotation pool. Banned-term scrub stays.

### 6. Product rotation + diversity scoring (new view + selector)
- New SQL view `pinterest_product_cooldown_v` joining last publish per slug.
- New table `pinterest_category_rotation` (slug, category, last_published_at).
- `pinterest-scheduler` reads view; skips slug if `< min_days_between_same_product` (default 14, already in settings). Picks slug from least-recently-published category first.

### 7. Natural scheduler (extend existing)
`pinterest-scheduler` + `pinterest-cron-worker`:
- Honor `publish_windows_est` + jitter (already in memory).
- New setting `max_pins_per_day` (default 6). Hard cap before any publish.
- Burst guard: min 75min gap between publishes.

### 8. Admin dashboard (extend `/admin/cinematic-ads`)
New `PinterestQualityPanel.tsx` showing per-job:
- media preview (video poster or image), pin type badge, duplicate-risk score (0–1 from pHash min-distance), engagement estimate (from `cinematic_pin_performance` avg by hook_archetype), hook archetype, slug cooldown countdown.
- Filter chips: video / slideshow / static / blocked.

### 9. Strict no-static-spam guard in `cinematic-ad-autopublish`
- Reject if `media_type='static'` AND last 5 published pins for slug were also static.
- Reject if pHash within distance ≤6 of any pin published last 30d (already partly in place, lift window from 100 to 30d).

### 10. Migration (additive)
- `cinematic_ad_settings`: `allow_static_fallback bool default false`, `max_pins_per_day int default 6`, `min_publish_gap_minutes int default 75`.
- `cinematic_ad_jobs`: `media_type text` (video|slideshow|carousel|static), `media_hash text`, `overlay_text text[]`, `hook_archetype text` (if missing).
- `pinterest_category_rotation` table + RLS admin-only.
- View `pinterest_product_cooldown_v`.
- Seed `cinematic_humanization_pools` with overlay/cta/hook pools listed above.

### Files to touch
- new: `_shared/pinterest-publish-priority.ts`, `cinematic-slideshow-generator/index.ts`, `remotion/src/MainVideoSlideshow.tsx`, `src/components/admin/cinematic/PinterestQualityPanel.tsx`, migration.
- edit: `_shared/pinterest-phash.ts`, `_shared/pinterest-video-meta.ts`, `cinematic-ad-autopublish/index.ts`, `cinematic-ad-storyboard/index.ts`, `pinterest-video-publisher/index.ts`, `pinterest-scheduler/index.ts`, `pinterest-cron-worker/index.ts`, `src/pages/admin/CinematicAdsControlCenterPage.tsx`.

### Explicit non-goals
- No new render engine; slideshow uses existing Remotion worker.
- No Pinterest delete actions; verification only.
- No changes to image-only viral batch beyond duplicate guard (already in place).
- No storefront/GMC/TikTok edits.

### Acceptance
1. Static pin publish requires `allow_static_fallback=true` AND no video/slideshow in 7d — blocked otherwise with `publish_blocked_reason='static_spam_guard'`.
2. Same media hash cannot publish twice in 30d.
3. Failed video render auto-queues slideshow job; static fallback never triggers from render failure path.
4. Admin panel shows pin type, duplicate risk, hook, cooldown per job.
5. Scheduler respects `max_pins_per_day` and 75-min gap.
6. Hook archetype rotates per slug — no archetype repeats within 7d for same slug.

Ready to execute on approval.
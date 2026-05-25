---
name: Pinterest video-first quality gate
description: Static spam guard, 30-day media_hash dedupe, daily cap, burst gap, cooldown view
type: feature
---
Migration adds `cinematic_ad_jobs.media_type|media_hash|overlay_text`, `cinematic_ad_settings.allow_static_fallback|max_pins_per_day|min_publish_gap_minutes`, `pinterest_category_rotation` table, `pinterest_product_cooldown_v` view, `pinterest_creative_pools` table (overlay_short/cta_us/hook_archetype/hashtag_us).

**Autopublish gates (cinematic-ad-autopublish):**
- Static rejected unless `allow_static_fallback=true` AND no video/slideshow for slug in last 7d AND last 5 publishes for slug not all static.
- `media_hash` dedupe over 30d window → status `failed_duplicate`, reason `media_hash_duplicate_30d`.
- Burst guard: min `min_publish_gap_minutes` (default 75) between any two publishes.
- Effective daily cap = min(existing `pinterest_publish_max_per_day`, new `max_pins_per_day`=6).
- On publish: upserts `pinterest_category_rotation` and adds hash to in-memory pool.

**Admin UI:** `PinterestQualityPanel` on `/admin/cinematic-ads` shows media preview, type badge (video/slideshow/static), hook, QA score, 7d type counts per slug, blocked reason.

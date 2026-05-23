---
name: Pinterest premium pivot
description: Hard creative law — no catalog spam, premium lifestyle only, KPIs are saves/CTR/watch not throughput
type: constraint
---
**Creative law (cinematic_ad_settings + autopublish gates):**
- 14-day cooldown per `product_slug` (`min_days_between_same_product`).
- 30-day hook cooldown (`hook_cooldown_days`).
- pHash distance threshold raised to 10 (`thumbnail_phash_distance_threshold`).
- Reject white-background, orange-title-bar, aggressive-CTA creatives (`reject_*` flags).
- Score floors: visual ≥75, hook ≥75, thumbnail entropy ≥70, first-frame ≥70.
- Allowed `creative_category` (`allowed_creative_categories`): cat_parent_struggles, odor_free_home, clean_lifestyle, cozy_pet_living, emotional_relief, funny_cat_moments, before_after, aesthetic_home, ugc_vertical.
- Blocked styles: catalog_white_bg, aggressive_cta_bar, orange_title_bar, template_spam, slideshow_montage.

**KPIs that matter:** saves, outbound CTR, watch time, engagement rate, comments, follows. NOT render count, publish count, or automation throughput.

**Cleanup pipeline:** `/admin/pinterest-cleanup` + `pinterest-cleanup-audit` edge fn (modes: scan / recommend / execute / trust). Hard floors: never delete pins with engagement_rate ≥1.5% or posted within 7 days. Batch cap 50.

**Why:** Eliminate template spam appearance, restore Pinterest trust, target indistinguishable-from-human-run pet brand aesthetic.
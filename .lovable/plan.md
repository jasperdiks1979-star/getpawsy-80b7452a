# Pinterest Content Engine v3 — Plan

Builds directly on the **video-first quality gate** already shipped (`cinematic-ad-autopublish` + `PinterestQualityPanel`). This adds the **content variation layer** the user is asking for.

## Scope

Turn the current single-product, mostly-static Pinterest pipeline into a rotating multi-format engine with 5 content archetypes, randomized hooks, product cooldowns, and a richer admin panel.

## Non-goals

- No new render engine (reuses existing Remotion worker + slideshow generator).
- No changes to GMC feed, storefront, TikTok, or auth.
- No deleting old pins; verification stays read-only.

---

## 1. Content archetypes (new `content_type` field)

Stored on `cinematic_ad_jobs.content_type`:

| type | description | trigger |
|---|---|---|
| `product_spotlight` | 1 product, 15–30s vertical video, captions + CTA | default when product has hero MP4 |
| `multi_product_compilation` | 3–5 products, "5 smart cat products" style | every 4th slot, picks top-rated within a category |
| `lifestyle_scene` | aesthetic scene (cozy home, smart pet living) with product appearing naturally | every 5th slot, uses lifestyle backdrop pool |
| `ugc_pov` | POV / reaction / "wish I bought sooner" hook | every 3rd slot |
| `animated_slideshow` | zoom/pan multi-image with captions | fallback when no MP4 exists for chosen product |

Strict order: never two consecutive jobs share the same archetype OR the same primary product.

## 2. Database migration

```
ALTER TABLE cinematic_ad_jobs ADD COLUMN
  content_type text,
  hook_archetype text,
  product_ids text[],          -- for compilations
  scene_template text,
  predicted_engagement numeric;

CREATE TABLE pinterest_archetype_cooldown (
  archetype text PRIMARY KEY,
  last_published_at timestamptz,
  cooldown_minutes int DEFAULT 180
);

CREATE TABLE pinterest_compilation_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_template text,         -- "{n} smart {category} products worth buying"
  category text,
  min_products int DEFAULT 3,
  max_products int DEFAULT 5,
  cta text,
  active boolean DEFAULT true
);

CREATE TABLE pinterest_lifestyle_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_name text,             -- 'cozy_morning', 'smart_home', 'relaxing_evening'
  backdrop_prompt text,
  overlay_hook text,
  music_mood text,
  active boolean DEFAULT true
);
```

Seed `pinterest_compilation_themes` (10 themes) and `pinterest_lifestyle_scenes` (8 scenes).

## 3. New edge function: `pinterest-content-director`

Single decision engine called by the scheduler. Returns `{content_type, product_ids, hook_archetype, scene_template, overlay_text, cta}`.

Logic order:
1. Read last 10 published pins → block recent archetypes/products.
2. Pick archetype from rotation order, skipping any in cooldown.
3. For chosen archetype, select products from `pinterest_product_cooldown_v` (oldest first, exclude <7d).
4. Pick hook + overlay from `pinterest_creative_pools` matching archetype.
5. Return a fully-formed job spec — never returns `static`.

## 4. Compilation video generator (`cinematic-compilation-renderer`)

- Takes 3–5 product IDs + theme.
- Composes Remotion scene: title card (2s) → 1 product per 4s with zoom/pan + numbered overlay → CTA card (2s).
- Always 9:16, 1080×1920, captions baked in.
- Outputs MP4 → `cinematic_ad_jobs.output_mp4_url`.

## 5. Lifestyle scene generator (`cinematic-lifestyle-renderer`)

- Uses AI-generated backdrop (Gemini image) + product cutout overlay.
- Slow camera drift + soft caption fade.
- 15s default, 9:16.

## 6. Slideshow auto-fallback (`cinematic-slideshow-generator`)

Triggered only when chosen product has no MP4 and has ≥3 product images. Builds zoom/pan slideshow with caption + CTA frame.

## 7. Scheduler upgrade (`pinterest-scheduler`)

- Calls `pinterest-content-director` instead of picking a single product.
- Spreads posts across day: 4–8 posts, min 75 min apart, with ±15 min jitter so timing isn't robotic.
- US prime-time weighting (12pm, 5pm, 8pm ET).

## 8. Variation guards (extend `cinematic-ad-autopublish`)

Add to existing gate (keeping all current static-spam protection):
- Block if same `content_type` published in last 2 pins.
- Block if any `product_id` in `product_ids` appears in any pin within last 7 days.
- Block if `hook_archetype` was used in last 3 pins.
- Existing pHash 30d window + daily cap stay in place.

## 9. Admin panel: `PinterestContentEnginePanel.tsx`

Adds to `/admin/cinematic-ads`:
- Today's queue with: content_type, hook, product list, media preview, cooldown countdown, predicted engagement, scheduled time.
- 7-day archetype mix bar chart (target: 40% spotlight / 20% compilation / 15% lifestyle / 15% UGC / 10% slideshow).
- "Force generate next" buttons per archetype for manual testing.
- Duplicate-risk badge per queued item.

## 10. Files

**New:**
- `supabase/functions/pinterest-content-director/index.ts`
- `supabase/functions/cinematic-compilation-renderer/index.ts`
- `supabase/functions/cinematic-lifestyle-renderer/index.ts`
- `supabase/functions/cinematic-slideshow-generator/index.ts`
- `render-worker/templates/CompilationVideo.tsx`
- `render-worker/templates/LifestyleScene.tsx`
- `render-worker/templates/Slideshow.tsx`
- `src/components/admin/cinematic/PinterestContentEnginePanel.tsx`
- Migration `2026xxxx_pinterest_content_engine.sql`

**Edited:**
- `supabase/functions/pinterest-scheduler/index.ts`
- `supabase/functions/cinematic-ad-autopublish/index.ts` (variation guards)
- `src/pages/admin/CinematicAdsControlCenterPage.tsx`

## 11. Acceptance

- 7-day mix shows all 5 archetypes present.
- No product appears in two pins within 7 days.
- No archetype appears 3× in a row.
- ≥80% of published pins are video or slideshow (not static).
- Admin panel shows full queue with previews + cooldowns.

---

**Rollout order:** migration → content-director → variation guards → scheduler → renderers (compilation → lifestyle → slideshow) → admin panel.

Approve and I'll execute in that order.

# Pinterest Premium Pivot + Deep Cleanup Mode

Two tightly-scoped, additive changes. No existing gate is weakened — all new constraints stack on top of the V3 stabilization layer already shipped (`publish_windows_est`, hook cooldown, phash dedupe, quarantine, recovery tier ladder).

---

## Part 1 — Premium Creative Pivot (publish-side)

Tighten the existing pre-publish gates in `cinematic-ad-autopublish` and the Pinterest queue guard in `pinterest-viral-batch` so the account *cannot* emit catalog-style spam.

### 1A. Settings (one additive migration)

Add to `cinematic_ad_settings` (all defaults safe; existing rows untouched):
- `min_days_between_same_product int default 14`
- `hook_cooldown_days int default 30` (raise from 7)
- `thumbnail_phash_distance_threshold int default 10` (raise from 6)
- `reject_white_background bool default true`
- `reject_aggressive_cta bool default true`
- `reject_orange_title_bar bool default true`
- `min_visual_uniqueness_score int default 75`
- `min_hook_uniqueness_score int default 75`
- `min_thumbnail_entropy_score int default 70`
- `min_first_frame_originality_score int default 70`
- `allowed_creative_categories jsonb` — default to the 9 categories listed below
- `blocked_creative_styles jsonb` — `["catalog_white_bg","aggressive_cta_bar","orange_title_bar","template_spam","slideshow_montage"]`

Add to `cinematic_ad_jobs`:
- `creative_category text` (cat_parent_struggles | odor_free_home | clean_lifestyle | cozy_pet_living | emotional_relief | funny_cat_moments | before_after | aesthetic_home | ugc_vertical)
- `visual_uniqueness_score int`
- `hook_uniqueness_score int`
- `thumbnail_entropy_score int`
- `first_frame_originality_score int`
- `style_rejection_reason text`

### 1B. New shared module: `_shared/creative-quality.ts`

Pure functions, no Lovable AI call required (deterministic + cheap):
- `computeEntropy(phashHex)` — Shannon entropy over hex nibbles, 0–100.
- `detectWhiteBackground(thumbnailUrl)` — sample 9 corners + edges, flag if avg luminance > 240 over >55% of pixels.
- `detectOrangeTitleBar(thumbnailUrl)` — scan top 18% of image for saturated orange band (#ff5a1f ± 30 hue).
- `detectAggressiveCta(overlayText)` — regex against banned patterns: ALL CAPS >4 words, "BUY NOW", "SHOP NOW!!", "🔥SALE🔥", "CLICK HERE", arrows.
- `scoreVisualUniqueness(phash, recentPhashes[])` — min Hamming distance / 64 → 0–100.
- `scoreHookUniqueness(hookText, recentHooks[])` — token Jaccard, lowest similarity → 100 - sim*100.
- `scoreFirstFrameOriginality(first3sPhash, recentFirst3s[])` — same as visual.

### 1C. `cinematic-ad-autopublish` updated gate order

After existing window/jitter gates, before publish:
1. `min_days_between_same_product` — query last publish per `product_slug`; reject if <14d.
2. Hook cooldown 30d (already wired, raise default).
3. Phash threshold 10 (raise default).
4. **New:** white-bg / orange-bar / aggressive-cta detection on thumbnail + overlay text.
5. **New:** all 4 uniqueness scores must clear floors. Write scores to `cinematic_ad_jobs`.
6. **New:** require `creative_category` ∈ `allowed_creative_categories`.

Rejected jobs get `style_rejection_reason` and stay in queue (no delete) so the cleanup admin can review.

### 1D. `pinterest-viral-batch` queue guard

Mirror the same checks at queue-insert time so manual/AI-creative-director drafts also pass.

### 1E. Storyboard bias

`cinematic-ad-storyboard` already samples humanization pools. Add:
- Bias hook generation toward 9 allowed creative categories.
- Strip prompt language like "product hero", "white background", "studio packshot".
- Inject mandatory style directive: "premium Pinterest-native pet lifestyle, cozy warm interior, golden hour, UGC handheld feel, emotional storytelling, no floating product card, no orange CTA bar".

---

## Part 2 — Deep Pinterest Cleanup Mode

Audit and prune the historical pin library. Read-only by default; deletes require explicit confirmation per batch.

### 2A. Schema (same migration as Part 1)

New tables (admin-only RLS, service-role full):
- `pinterest_cleanup_audit`
  - `pin_id text pk`
  - `slug text`
  - `thumbnail_phash text`
  - `hook_text text`
  - `creative_category text`
  - `composite_quality_score int` (0–100)
  - `visual_dup_count int` (count of near-duplicates within distance ≤ threshold)
  - `slug_repeat_count int`
  - `hook_repeat_count int`
  - `is_slideshow_spam bool`
  - `engagement_rate numeric`
  - `recommendation text` — KEEP | ARCHIVE | DELETE
  - `reasons jsonb` (array of detected issues)
  - `audited_at timestamptz`
- `pinterest_cleanup_actions`
  - `pin_id text`, `action text` (archive|delete), `executed_at`, `executed_by uuid`, `pre_action_snapshot jsonb`

### 2B. New edge function: `pinterest-cleanup-audit`

Modes (via `?mode=`):
- `scan` — paginate `pinterest_pin_queue` + Pinterest analytics; for every published pin compute:
  - phash dup count vs all other pins
  - slug repeat count
  - hook Jaccard against all other hooks (>0.6 = repeat)
  - slideshow signature flag (low motion entropy from `cinematic_pin_performance`)
  - engagement_rate from `cinematic_pin_performance` (if no data, neutral 50)
  - composite score: weighted sum (uniqueness 35 + engagement 35 + recency 10 + style_quality 20)
  - recommendation rule:
    - composite < 35 OR (slug_repeat ≥ 4 AND engagement < 0.3%) → **DELETE**
    - composite 35–60 OR slideshow_spam → **ARCHIVE**
    - else → **KEEP**
- `recommend` — return top N delete/archive candidates, paginated.
- `execute` — body `{action, pin_ids[]}`; archive sets local archived flag + writes `pinterest_cleanup_actions`; delete additionally calls Pinterest `DELETE /v5/pins/{id}` (rate-limit 4 concurrent, jitter), then writes deletion-verification row reusing the existing pipeline.

### 2C. New shared computed view-style RPC

`get_trust_recovery_score()` returns:
- avg composite score of last 100 published pins
- % within last 14d that passed all new gates
- duplicate density (pins per cluster ≥ threshold)
- engagement_rate avg last 30d
- final score 0–100 (weighted), updated whenever audit runs.

### 2D. Admin UI — `/admin/pinterest-cleanup`

New lazy-loaded page under `AdminRouteGuard`:
- Header card: **Trust Recovery Score** big number + last-audit timestamp + "Run scan" button.
- Tabs: All audited / Recommended DELETE / Recommended ARCHIVE / KEEP.
- Each row: thumbnail, slug, hook, composite score, reasons chips, individual KEEP / ARCHIVE / DELETE buttons.
- Batch mode: multi-select + "Archive selected" / "Delete selected" with a typed confirmation modal ("type DELETE 12 pins").
- Filter by visual_dup_count, slug, hook similarity, engagement_rate.
- "Old V2 patterns first" sort = composite ASC + slug_repeat DESC + non-V3 engine_version.
- Mobile-friendly stacked layout.
- Empty state ("No audit yet — run scan"), loading state, error inline.
- Add link from Cinematic Ads Control Center + sidebar entry "Pinterest Cleanup".

### 2E. Safety guarantees

- Delete action always:
  1. Snapshots row to `pinterest_cleanup_actions.pre_action_snapshot`
  2. Calls remote Pinterest delete
  3. Triggers `pinterest-pin-deletion-verify` for that ID
  4. Marks local archived (never hard-deletes the DB row)
- Hard floor: never delete a pin with engagement_rate ≥ 1.5% regardless of duplication (high-performing protection).
- Hard floor: never delete pins published in the last 7 days (cold-start protection).
- Batch cap: 50 pins per execute call.

---

## Files

New:
- `supabase/functions/_shared/creative-quality.ts`
- `supabase/functions/pinterest-cleanup-audit/index.ts`
- `src/pages/admin/PinterestCleanupPage.tsx`
- `supabase/migrations/<ts>_premium_pivot_and_cleanup.sql`

Edited:
- `supabase/functions/cinematic-ad-autopublish/index.ts` — new gates
- `supabase/functions/cinematic-ad-storyboard/index.ts` — premium bias + banned-style strip
- `supabase/functions/pinterest-viral-batch/index.ts` — queue-side mirror checks
- `src/App.tsx` — register `/admin/pinterest-cleanup`
- `src/components/admin/AdminLayout.tsx` — sidebar link
- `src/pages/admin/CinematicAdsControlCenterPage.tsx` — header link to cleanup
- `src/integrations/supabase/types.ts` — auto-regen
- `mem/features/cinematic/video-engine-v3.md` — append premium-pivot notes
- New `mem/marketing/pinterest-premium-pivot.md` — codify the new creative law (no white bg / no orange bar / no aggressive CTA / 14d slug / 30d hook / 9 categories / KPIs = saves+watch+CTR not throughput)

---

## Verification

After deploy:
1. `pinterest-cleanup-audit?mode=scan` (dry) — confirm rows populate.
2. `cinematic-ad-autopublish?dryRun=true&audit=true` — confirm 4 new uniqueness scores + reject reasons appear in response.
3. Open `/admin/pinterest-cleanup` and `/admin/pinterest-recovery` — both load, Trust Recovery Score visible.
4. Run a small batch archive (5 pins) end-to-end.

Reply **go** to execute.
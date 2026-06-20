# GetPawsy Revenue Engine V4 — Build Plan

Large, multi-system upgrade across Pinterest publishing, video rendering, inventory safety, and admin observability. Splitting into 4 phases so each ships verifiable.

---

## Phase 1 — Inventory Safety + Quality Gate (foundation)

New shared module `supabase/functions/_shared/pinterest-eligibility.ts`:

- `assessProductEligibility(productId)` returns `{ eligible, reason, mediaScore, inventory, status }`.
- Reasons: `out_of_stock | inactive | hidden | archived | missing_inventory | cj_zero | media_score_low | destination_404`.
- Media score formula (0–100): video +30, ≥5 photos +20, ≥1200px +20, lifestyle +10, white-bg +10, multi-angle +10.

New table `pinterest_eligibility_log` (product_id, eligible bool, reason, media_score, inventory, checked_at, source) + GRANTs + admin RLS.

Wire `assessProductEligibility` into:
- `pinterest-video-queue-drain` — refuse non-eligible, mark queue row `ineligible`.
- `pinterest-creative-director` — skip seeding ineligible products.
- `cinematic-ad-orchestrator` (or v3/v4 entry) — refuse render if score < 60.

Hard rules (Quality Gate, item 10):
- inventory > 0
- media_score ≥ 60
- destination URL HEAD = 200
- product `is_active = true`, not hidden/archived
- video passes V4 motion validation (Phase 3)

---

## Phase 2 — Winner Replacement Engine

New edge function `pinterest-winner-replacement`:
1. Scan `pinterest_pin_performance` for top decile (CTR + outbound + saves).
2. For each, re-check destination product eligibility via Phase-1 helper.
3. If ineligible, query products with same `category`, similar price band (±25%), `is_active=true`, `inventory>0`, `media_score≥80`.
4. Insert new queue row + dispatch cinematic render keyed to replacement product.
5. Log to new `pinterest_replacement_log` (winner_pin_id, original_product_id, replacement_product_id, reason, created_at).

Cron daily 04:00 UTC.

---

## Phase 3 — Video Quality + Product-Video-First

In `cinematic-ad-validate`:
- Add `static_video_check`: scene count ≥ 5, scene_change_count ≥ 4, camera_motion_score ≥ 65. Else `reject_video=true`, `v4_reject_reasons += 'static_video'`, auto-requeue (max 2 retries).

In `cinematic-ad-orchestrator` source selection (item 5):
1. If `product_media` has `media_type='video'` from CJ/supplier → rehost + use directly, skip AI slideshow.
2. Else if ≥5 photos → photo-driven cinematic.
3. Else AI cinematic.

Persist `creative_source_tier` on `cinematic_ad_jobs` (`product_video | photos | ai`).

---

## Phase 4 — Creative Diversity + Winner Cloner + Cleanup + Dashboard

**Diversity (item 6):** in `pinterest-creative-director`, before accepting a draft, query last 200 published pins' `meta->>headline`. If chosen headline already appears ≥3× → regenerate with rotated hook category (`problem|curiosity|benefit|emotion|comparison|surprise|before_after|urgency`). Stored already in `pinterest_render_attempts`.

**Winner Cloner (item 7):** new `pinterest-winner-cloner` edge function. Reads top 20 winners from `pinterest_creative_winners`, extracts `{ hook_category, headline_pattern, scene_pattern, cta, duration }`, writes `pinterest_winner_templates` table. `pinterest-creative-director` consumes templates with 40% probability when seeding pins for products in same category as a winner.

**Sales mode (item 8):** add `pinterest_runtime_settings.optimization_target = 'sales'`. `pinterest-winner-rollup` reweights composite score: outbound 0.5, sales 0.4, saves 0.08, impressions 0.02.

**Auto cleanup (item 9):** new cron `pinterest-queue-cleanup-daily` (`0 5 * * *`):
- Delete queue rows with ineligible products, broken URLs (HEAD ≠ 200), duplicate dest URL within 7d.
- Archive Pinterest pins pointing at OOS products via existing archive endpoint.

**Admin dashboard (item 11):** new page `/admin/pinterest-revenue-v4` + edge function `pinterest-revenue-v4-dashboard` returning:
- blocked_by_inventory, blocked_by_media, creative_winners, top_ctr_pins, top_sales_pins, oos_pins, replacements_generated_7d, avg_video_quality, avg_media_score, avg_inventory_score.

Lazy-loaded route. Admin RLS via `has_role`.

**Immediate action (item 12):** one-shot edge function `pinterest-revenue-v4-bootstrap` invoked once after deploy:
1. Run eligibility check on every row in `pinterest_pin_queue` + `pinterest_video_queue` + `cinematic_ad_publish_queue`. Remove failures.
2. Pick top 25 products by `media_score≥80 AND inventory>0 AND product_winner_scores.score DESC` → enqueue cinematic renders.
3. Flip `pinterest_runtime_settings.v3_publish_paused=false` to resume auto-publish.

---

## Migrations (single file)

1. `pinterest_eligibility_log` table + GRANT + RLS (admin select, service_role all).
2. `pinterest_replacement_log` table + GRANT + RLS.
3. `pinterest_winner_templates` table + GRANT + RLS.
4. `cinematic_ad_jobs.creative_source_tier text`.
5. `pinterest_runtime_settings.optimization_target text default 'sales'`.

## Crons (separate insert, not migration)

- `pinterest-winner-replacement` — `0 4 * * *`
- `pinterest-queue-cleanup-daily` — `0 5 * * *`
- `pinterest-winner-cloner` — `0 6 * * *`

## Out of scope

- Rewriting Remotion scene composition (already V4).
- Touching V5 engine.
- New brand visuals.

## Risk notes

- Eligibility helper runs synchronously inside drain — keep ≤500ms with batched product fetch.
- HEAD 200 check is rate-limited (max 200/min) and cached 1h to avoid hammering the storefront.
- All new tables admin-read-only; no anon grants.

Approve and I'll ship Phase 1 + migrations first, then proceed phase-by-phase.

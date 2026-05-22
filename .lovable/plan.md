# Cinematic V3 — Final Stabilization Pass

Additive hardening of the existing `cinematic-ad-autopublish` + `cinematic-ad-validate` + `cinematic-ad-storyboard` pipeline. No weakening of any existing gate; all new logic stacks on top.

## 1. Schema (single additive migration)

`cinematic_ad_settings` — add:
- `publish_windows_est jsonb default '[{"start":7,"end":9},{"start":12,"end":14},{"start":19,"end":23}]'`
- `publish_jitter_min_seconds int default 420`, `publish_jitter_max_seconds int default 2700`
- `recovery_auto_exit_days int default 7`
- `recovery_tier_progression jsonb default '{"tier1":2,"tier2":3,"tier3":4}'`
- `hook_cooldown_days int default 7`
- `thumbnail_phash_distance_threshold int default 6`
- `board_recent_window_minutes int default 720`
- `board_max_pins_per_window int default 2`

`cinematic_ad_jobs` — add:
- `thumbnail_phash text` (64-bit perceptual hash hex)
- `first3s_phash text`
- `overlay_text_hash text`
- `hook_archetype text` (curiosity|problem_solution|before_after|emotional|generic)
- `scheduled_publish_at timestamptz`
- `humanization_seed text`
- `qa_breakdown jsonb` (per-axis scores)

New tables:
- `cinematic_pin_performance` — `pin_id, asset_id, hook_archetype, board_id, outbound_clicks, saves, impressions, watch_seconds_p50, engagement_rate, collected_at`
- `cinematic_quarantine_patterns` — `pattern_type (hook|storyboard|thumbnail_phash|board), pattern_value, reason, quarantined_until, created_at`
- `cinematic_humanization_pools` — `pool_type (caption_template|cta|hashtag_group|opener), variants jsonb, weights jsonb`

All admin-only RLS, service-role full access. All fields nullable with defaults — existing jobs untouched.

## 2. Edge function changes

### `cinematic-ad-autopublish` (updated)
Pre-publish gate adds, in order, BEFORE existing QA/cooldown checks:
1. **Window gate** — convert now→EST; if outside `publish_windows_est`, skip job and set `scheduled_publish_at` to next window start + random jitter.
2. **Jitter gate** — if `last_publish_at + jitter < now`, skip.
3. **Perceptual dedupe** — compute Hamming distance to last 100 `thumbnail_phash`; reject if ≤ threshold. Same for `first3s_phash` and exact match on `overlay_text_hash`.
4. **Hook cooldown** — reject if `hook_archetype` was used in last 7 days.
5. **Board diversification** — pick the eligible board with the lowest pin-count in the last 12h, capped at 2/board/window. Never repeat product slug within 240min (existing).
6. **Quarantine filter** — reject if job matches any active row in `cinematic_quarantine_patterns`.
7. **Recovery tier** — compute current tier from clean-streak days: 0–6 = tier1 (2/hr), 7–13 = tier2 (3/hr), 14+ = tier3 (4/hr). Auto-flip `pinterest_publish_recovery_mode=false` after 7 clean days (0 QA fails, 0 dedupe violations).

### `cinematic-ad-storyboard` (updated)
- Inject humanization pools from `cinematic_humanization_pools` (random pick per render using `humanization_seed`).
- Bias hook selection: weighted sample from `cinematic_pin_performance` top-3 archetypes (70%) + explore (30%). Deprioritize `generic` archetype to ≤10% weight.
- Output `hook_archetype` to job row.

### `cinematic-ad-validate` (updated QA weights)
New composite formula (max 100):
- caption_readability 15, safe_margins 15, scene_change_count 12, motion_entropy 12, hook_strength 12, thumb_uniqueness 10, mobile_framing 8, audio_pacing 6, brand_safety 10
- Penalties: slideshow_flag -25, static_zoom_only -15, unreadable_caption -20, duplicate_scene_composition -15, repeated_product_angle -10
- Hard-reject (set status=quarantined_asset) when: text outside safe area OR >35% static frames OR subtitle cutoff OR repeated scene loop OR hook reused in 7d.
- Write per-axis to `qa_breakdown`.

### New: `cinematic-pin-performance-sync` (cron, daily 04:00 UTC)
- Pulls Pinterest analytics (impressions, saves, outbound, video_avg_watch_time) for last 30d into `cinematic_pin_performance`.
- Computes per-hook + per-board engagement_rate.
- Quarantines patterns where engagement_rate < 0.5% AND impressions ≥ 500: inserts `cinematic_quarantine_patterns` row (hook + thumbnail_phash + storyboard signature) for 14 days.
- Reduces frequency cap for matched patterns.

### Cron
Use `supabase insert` (not migration) to register two pg_cron jobs:
- `cinematic-ad-autopublish` every 5 min (existing — verify)
- `cinematic-pin-performance-sync` daily

## 3. Files

New:
- `supabase/functions/cinematic-pin-performance-sync/index.ts`
- `supabase/functions/_shared/phash.ts` (8x8 DCT pHash, Hamming distance)
- `supabase/functions/_shared/humanization.ts` (pool sampler, archetype router, seeded RNG)
- `supabase/functions/_shared/publish-window.ts` (EST window + jitter calculator)

Edited:
- `supabase/functions/cinematic-ad-autopublish/index.ts` — window/jitter/phash/hook/board/quarantine/tier gates
- `supabase/functions/cinematic-ad-storyboard/index.ts` — humanization pool injection + DNA bias
- `supabase/functions/cinematic-ad-validate/index.ts` — new QA weights + breakdown
- `src/integrations/supabase/types.ts` — auto-regen
- `mem/features/cinematic/video-engine-v3.md` — append stabilization notes

## 4. Seed data (via insert tool)

Seed `cinematic_humanization_pools` with: 8 caption templates, 6 CTA variants, 5 hashtag groups, 7 opener patterns — all merchant-safe, US-native, no banned terms.

## 5. Self-test output

After deploy, invoke `cinematic-ad-autopublish?dryRun=true&audit=true` and report:
- system_health_score (gates passing / total)
- trust_recovery_status (clean-streak days, recovery tier)
- uniqueness_score (avg phash distance over last 50 pins)
- automation_footprint_score (publishes/hour vs human baseline 0.3/hr)
- viral_readiness_score (avg hook DNA weight × QA composite)

## 6. Safety guarantees

- All new gates ADD to existing checks — QA floor 70, slug 240min cooldown, hourly cap, slideshow rejection, caption safety all preserved.
- Recovery mode can auto-exit but cannot be lowered below current floor manually.
- Quarantine inserts only, never deletes pins or assets.
- Admin allowlist + service-role on every edge fn unchanged.

Reply **go** to execute (single migration + 4 new files + 3 edits + 1 insert seed + 1 cron registration).

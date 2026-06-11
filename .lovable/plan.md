
# Pinterest Growth Engine (Phase 2)

Build an autonomous Pinterest engine on top of the existing tracking / scoring stack. Reuse — don't replace — what's already live (`pinterest_pin_attribution`, `pinterest_product_conversion_score`, `pinterest_pin_queue`, board governance, queue type contract, US optimization rules).

## What gets built

### 1. Edge function: `pinterest-growth-orchestrator` (the nightly brain)
One function, idempotent, runs nightly via `pg_cron`. Steps in order:
1. **Recompute scores** — invoke `pinterest-pin-attribution` (pin tier) + `pinterest-product-conversion-score` (product tier) with `apply=true`.
2. **Winner amplifier** — for products tier=`winner`:
   - Upsert `pinterest_product_tiers` with `priority='high'`, `publish_multiplier=3`, `extra_boards=true`.
   - Enqueue 5 new pin drafts + 3 video drafts via existing `pinterest-creative-director` + `pinterest-video-queue` (drafts only, per queue contract).
3. **Loser suppression** — for products tier=`loser`:
   - Set `pinterest_product_tiers.status='paused'`, `block_reason='low_conversion_score'`.
   - Mark queued pins for those products `status='paused'` (never delete existing live pins — safety rule).
4. **Hidden opportunity miner** — query products with `avg_dwell_ms > 8000` OR `gallery_interactions >= 3` OR `variant_selections >= 2` AND `pin_count_30d < 3`. Tag `hidden_opportunity=true`, enqueue 3 pin drafts each.
5. **Daily publish budget** — pick 20–30 drafts respecting:
   - Board distribution across 8 categories (Cat Toys, Dog Toys, Cat Furniture, Dog Beds, Grooming, Outdoor, Training, Accessories) via existing board mapping.
   - Image hash dedupe (`pinterest_pin_dimensions` / `pinterest_winner_dimensions`).
   - Title/description dedupe (normalized hash check vs last 90d in `pinterest_pin_queue`).
   - 90-min gap + US daily warm-up cap already enforced by existing publisher — we only enqueue, not publish.
6. **Log everything** to new `pinterest_growth_runs` (run summary) + `pinterest_growth_actions` (per-action audit).

### 2. New DB tables (one migration)
- `pinterest_growth_runs` — `started_at`, `finished_at`, `recomputed`, `winners_amplified`, `losers_suppressed`, `opportunities_found`, `drafts_enqueued`, `errors`, `summary jsonb`.
- `pinterest_growth_actions` — `run_id`, `action_type` (amplify|suppress|opportunity|enqueue|dedupe_skip), `product_id`, `pin_id`, `reason`, `payload jsonb`.
- `pinterest_product_tiers` already exists (11 cols) — reuse; add columns only if missing: `block_reason`, `publish_multiplier`, `hidden_opportunity`.

All tables get GRANT + RLS (admin-read, service_role-all).

### 3. Pin/title/description dedupe
Helper in the orchestrator: SHA-256 of normalized title/description compared against `pinterest_pin_queue` rows from last 90 days. Image dedupe uses existing `pinterest_pin_dimensions.image_hash`. Skips are logged as `dedupe_skip`.

### 4. SEO copy generation
Reuse `pinterest-creative-director` (already does title + description + alt). Pass `seo_mode=true` to request keyword-frontloaded titles and a hashtag tail. No new LLM function — just extend the existing prompt.

### 5. Nightly cron
`pg_cron` job at 03:15 UTC calling the orchestrator via `pg_net`. Inserted with the insert tool (not migration) so anon key isn't committed.

### 6. Dashboard: `/admin/pinterest-growth`
New page `PinterestGrowthPage.tsx`. Shows, with 7d/30d/90d toggle:
- KPI cards: real Pinterest sessions, pageviews, ATC, checkouts, purchases, CTR, avg engagement / conversion / revenue score.
- Trend lines (recharts) per KPI over selected window.
- **Winner Amplification panel** — winners with multiplier, extra-board status, drafts generated last 24h.
- **Loser Suppression panel** — losers with block reason + paused-pin count.
- **Hidden Opportunities panel** — products flagged this run with dwell/gallery/variant counts and pins-enqueued.
- **Run log** — last 14 nightly runs from `pinterest_growth_runs`.
- "Run now" button (admin only) to invoke orchestrator on-demand.

Lazy-loaded (bundle policy). Route added to `src/App.tsx`.

### 7. Safety guarantees (hard-coded in orchestrator)
- Never `DELETE` products or pins. Only flip `status` / `priority`.
- Never overwrite existing `pinterest_pin_queue` rows that are `published`, `live`, or `verified`.
- Every state change writes to `pinterest_growth_actions`.
- Per-run hard caps: max 30 drafts enqueued, max 50 status flips. Cap exceedance → log + stop.

## Out of scope (explicit)
- No new image generation pipeline — uses existing creative director + AI backdrops.
- No changes to live publisher cadence — existing 4-pin/day warm-up + 90-min gap rules still authoritative.
- No deletion of any existing Pinterest data (per safety block).

## Files
**New:**
- `supabase/migrations/<ts>_pinterest_growth_engine.sql` — 2 tables + columns on `pinterest_product_tiers`.
- `supabase/functions/pinterest-growth-orchestrator/index.ts`.
- `src/pages/admin/PinterestGrowthPage.tsx`.

**Edited:**
- `src/App.tsx` — register `/admin/pinterest-growth` (lazy).
- `supabase/functions/pinterest-creative-director/index.ts` — add `seo_mode` flag (titles + hashtag tail).

**Cron:** inserted via `supabase--insert` after migration approval.

## Verification
1. Migration applied → confirm `pinterest_growth_runs` exists.
2. `curl_edge_functions` POST orchestrator with `{dry_run:true}` — expect counts only, zero writes.
3. Then real run — confirm rows in both new tables + drafts in `pinterest_pin_queue` with `status='queued'`.
4. Visit `/admin/pinterest-growth` — KPI cards populate, run log shows the manual run.

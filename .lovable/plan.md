# Pinterest Competitor Intelligence Engine

Surgical extension of the existing Pinterest stack (Growth Engine, Brain, Creative Director, publisher, queue, board governance). No duplicate systems — every new piece plugs into existing tables, crons and guardrails.

---

## 1. Reuse map (no rebuilds)

| Concern | Reused asset |
|---|---|
| Draft persistence | `pinterest_pin_queue` (status=`draft`) |
| Creative generation | `pinterest-creative-director` (`generate_briefs` action) |
| Publisher / warm-up / 25-pin budget | existing publisher, `pinterest_publish_governor`, board whitelist |
| Loser suppression / amplification | `pinterest-growth-orchestrator`, `pinterest-growth-brain` |
| Trend keywords | `pinterest_trend_signals` |
| Board routing | `pinterest_board_mappings` |
| Tier/opportunity ranking | `pinterest_product_tiers`, `pinterest_opportunity_ranks` |
| Web scraping | Firecrawl connector (already wired) |
| AI model gateway | Lovable AI (`google/gemini-3-flash-preview`) |
| Queue insert contract | `_shared/pinterest-queue-types.ts` |
| Visual dedupe | existing pHash guard |
| UTM validator | `utmAttributionValidator` |

Existing `pinterest_competitor_pins` table is REUSED (already has 9 cols + 2 RLS policies) — only add missing columns rather than re-create.

---

## 2. New database (single migration)

**Extend `pinterest_competitor_pins`** (additive only — no drops):
add `product_id uuid`, `product_slug text`, `query text`, `source_url text`, `domain text`, `title_hash text`, `title_sample text`, `description_sample text`, `board_name text`, `visual_type text`, `hook_angle text`, `benefit_angle text`, `cta_pattern text`, `detected_keywords text[]`, `visible_saves int`, `visible_comments int`, `visible_engagement_score numeric`, `freshness_score numeric`, `relevance_score numeric`, `competitor_success_score numeric`.
Unique index `(product_id, title_hash, source_url)`.

**New tables** (all with GRANT to authenticated+service_role, RLS, admin-read via `has_role`):
- `pinterest_competitor_patterns` — `pattern_type` (title/hook/benefit/cta/visual/keyword/board), `pattern_value`, `sample_count`, `avg_success`, `niche_key`, `last_seen_at`.
- `pinterest_competitor_opportunities` — `product_id`, `product_slug`, `competitor_gap_score`, `components jsonb` (margin/availability/pin_count/traffic/us_fit/visual), `top_patterns jsonb`, `rank int`, `generated_drafts int default 0`.
- `pinterest_competitor_runs` — `started_at`, `finished_at`, `mode` (dry/live), `products_scanned`, `competitor_candidates_found`, `patterns_extracted`, `opportunities_created`, `drafts_generated`, `queued`, `rejected`, `errors`, `health jsonb`, `notes`.

No deletes anywhere. Service-role writes from edge functions.

---

## 3. Edge function `pinterest-competitor-intel`

Single function, multi-action POST `{action, dry_run}`:

- `scan` — pick ≤25 active products (`margin_percent>=0.30`, image_url present), generate 5–10 commercial queries per product (title + category + benefits + top trend keywords), Firecrawl search (US locale) up to 20 candidates/product, parse metadata only (title/description/board/domain/visible engagement). Classify hook/benefit/cta/visual via cheap Gemini Flash call (batched 10 pins/call). Dedup by `(product_id, title_hash, source_url)`. Insert into `pinterest_competitor_pins`.
- `score` — compute `competitor_success_score` per row (weighted sum: relevance 25, engagement 20, keyword 15, commercial intent 10, freshness 10, board fit 5, visual 5, US fit 5, niche 5).
- `extract_patterns` — group winners (score≥80) by niche → upsert into `pinterest_competitor_patterns` with rolling `avg_success`.
- `rank_opportunities` — per product compute `competitor_gap_score` from documented formula, upsert top 100 into `pinterest_competitor_opportunities`.
- `generate_drafts` — for top N opportunities call `pinterest-creative-director` with `seo_mode=true`, pattern hints (`top_patterns`), `count` capped so global run cap ≤100 drafts. Drafts land in `pinterest_pin_queue` as `status='draft'` with required UTM (`utm_source=pinterest&utm_medium=social&utm_campaign=competitor_intel&utm_content=${draftId}`). Re-uses board whitelist and pHash guard. No competitor images/videos persisted.
- `run_full` — orchestrates scan → score → extract → rank → generate, writes a `pinterest_competitor_runs` row with all counters + health flags (`competitor_scan_ok`, `competitor_data_fresh`, `competitor_dedupe_ok`, `drafts_generated`, `queue_insert_ok`, `publisher_accepts_competitor_drafts`, `utm_valid`, `no_copyright_copy_detected`).

Hard caps per run: 25 products, 20 candidates/product, 100 drafts, 8-min timeout. Idempotent (run_id guard).

Copyright/safety: store only title/description text snippets ≤200 chars + structural metadata, never image bytes or video URLs persisted to our storage; AI generator forbidden from quoting >5 contiguous competitor words (system prompt enforced + regex dedupe pass post-generation).

---

## 4. Cron

Reuse `pg_cron` slot — schedule `pinterest-competitor-intel` action `run_full` at `15 3 * * *` UTC (30 min after Brain). Insert via `supabase--insert` (uses anon key + project ref).

---

## 5. Admin UI

**New page `/admin/pinterest-spy`** (`PinterestSpyPage.tsx`, lazy-loaded, admin-gated):
- Run scan / Dry run / Generate drafts / Approve top 25 / Export CSV buttons
- Last run card (counters + health badges)
- Top competitor patterns (grouped by type)
- Top 100 product opportunities table (product, gap score, components, generated drafts count, actions: Generate / Approve / Reject)
- Per-product drawer: recommended titles, descriptions, overlays, boards, sample competitor snippets (clearly labeled "inspiration only, not copied")
- Safety banner explaining copyright-safe inspiration policy
- Mobile-friendly (existing admin layout)

**Widget on `/admin/pinterest-growth`**: "Competitor Intel" card — opportunities found, top 5 products to push, drafts generated, est. monthly traffic potential (`sum(competitor_gap_score) * 0.15` proxy), warning when no fresh data (>48h).

Route registered in `src/App.tsx`.

---

## 6. Validation pass

After deploy:
1. Dry-run `run_full` → expect ≥10 drafts, log counters.
2. Verify queue insertion via `pinterest_pin_queue` rows where `meta->>'source'='competitor_intel'`.
3. Confirm no new image/video files in storage.
4. Confirm UTM on each draft via `utmAttributionValidator`-compatible params.
5. Spot-check destination URLs resolve.
6. Verify dashboard renders at 440px viewport.

---

## 7. Files

**Created**
- `supabase/functions/pinterest-competitor-intel/index.ts`
- `supabase/migrations/<ts>_competitor_intel.sql`
- `src/pages/admin/PinterestSpyPage.tsx`
- `mem/marketing/pinterest-competitor-intel.md`

**Edited**
- `src/App.tsx` — add `/admin/pinterest-spy` lazy route
- `src/pages/admin/PinterestGrowthPage.tsx` — add Competitor Intel widget
- `.lovable/plan.md` — record phase

**Untouched**: publisher, queue contract, creative director core, growth orchestrator/brain (called as black boxes), board governance, RLS on existing tables.

---

## 8. Out of scope

- No new image generation pipeline (reuses Creative Director).
- No live Pinterest Trends API (gated).
- No competitor pin re-publishing or asset storage.
- No edits to publisher cadence, warm-up, or 25-pin daily cap.
- No deletes of any existing data.

---

## Projections

- 25 products × ~12 candidates/day = ~300 competitor rows/day
- ~30–60 high-score patterns/week
- 60–100 original drafts/day routed through existing approval flow
- No additional publish rate — fills existing 25-pin/day budget with higher-intent creative


# Autonomous Creative Optimization Engine V1

Builds the layer that turns the existing CJ media library into scored, deduped, budget-guarded draft creatives for Pinterest + on-site, with admin approval before anything reaches `pinterest_pin_queue`. No direct publishing. AI generation is dry-run by default.

## What ships

### Database (1 migration)

New tables (all admin-RLS, `service_role` full access):

- `creative_assets` — one row per draft creative (product, source media, type, hook/headline/subheadline/cta, image_url, pdp_url, utm_url, status, scores, costs, model, run_id)
- `creative_variants` — alt copy/layout variants linked to a parent asset
- `creative_generation_runs` — per-run metrics (mode, requested, generated, skipped, ai_cost_usd, ai_credits, dry_run, budget_cap, status)
- `creative_performance_snapshots` — daily per-asset stats from Pinterest + funnel events
- `creative_rotation_rules` — board/category/product caps (seeded with safe defaults)
- `creative_fatigue_flags` — hook/visual/product fatigue records
- `creative_test_queue` — A/B test slots
- `creative_approval_queue` — pending admin review (view backed by `creative_assets` where status='draft')
- `creative_prompts` — reusable prompt templates (seeded with the 11 types from spec)
- `creative_budget_guardrails` — singleton id=1 (`max_per_run`, `max_usd_per_run`, `per_product_per_day`, `videos_per_product_per_week`, `auto_generate_enabled=false`, `dry_run_default=true`)

`app_config` keys added: `creative_auto_generate_enabled=false`.

### Edge functions (5 new)

1. **`creative-score-engine`** — scores eligible products (active, in-stock, priced, local-hosted hero image, valid category, working slug) using RPS V2.1 tier, category gap vs `pinterest_category_targets`, 30-day pin coverage, freshness, hook fatigue, PDP health. Writes `priority_score`, recommended creative_type/board/hook into `creative_assets` shadow rows or a planning table.
2. **`creative-generation-planner`** — builds a prioritized batch plan (top 30 products, top 8 category gaps, top 10 ad/pinterest/PDP candidates). Returns plan + cost estimate. Never generates.
3. **`creative-generate-batch`** — honors `dry_run`, `max_per_run`, `max_usd_per_run`. Default path = no-AI text/layout variants from existing local media. AI path (gemini-3-flash text + nano-banana image) only when `dry_run=false` and budget allows. Runs through `creative-diversity-guard` before insert.
4. **`creative-diversity-guard`** — pure validator: rejects repeated hooks (>3 in 30d), repeated CTA, banned dropshipping phrases ("stop scooping" et al per memory), per-product/per-category/per-board caps, duplicate media-url within 14d. Exported for reuse.
5. **`creative-performance-snapshot`** — pulls `pinterest_analytics_daily` + `pinterest_funnel_events` joined by `creative_asset_id` (stamped via UTM `cr_id` param), writes daily snapshot, flags winners/losers/fatigue.

Reused existing functions: `pinterest-analytics-sync`, `pinterest_pin_queue` writers, `pinterest-credit-state` for AI balance.

### Cron (pg_cron, all safe)

- `creative-score-nightly` — 04:15 UTC
- `creative-planner-nightly` — 04:30 UTC (writes plan to `creative_generation_runs` as `planned` row, never executes)
- `creative-fatigue-daily` — 05:15 UTC
- `creative-performance-daily` — 05:45 UTC

No cron triggers `creative-generate-batch`. AI generation is admin-button-only until `creative_auto_generate_enabled=true` (left false).

### Admin UI

- **`/admin/creative-command`** — single page with: AI balance card (uses `aiPricing.ts`), scorecard, run planner button, "Dry run plan" button, "Generate safe batch (no-AI)" button, "Generate AI batch" gated button with cost-confirm dialog, draft approval queue (approve→pinterest_pin_queue / approve→PDP candidate / reject / regenerate), category gaps panel, run history, fatigue flags.
- Route registered in `src/App.tsx`.

### Pinterest queue integration

Approval action runs guard checks (re-run diversity guard, verify pdp URL 200, verify media is on Supabase storage), then inserts into `pinterest_pin_queue` with `meta.creative_asset_id` for traceability and a UTM URL containing `utm_source=pinterest&utm_medium=cpc&utm_campaign=creative_v1&cr_id={asset_id}`. Existing pHash duplicate guard already in queue path is respected.

### Validation run (executed at end)

1. linter on new migration
2. deploy + smoke-call each new function with `dry_run=true`
3. run scorer → count eligible products
4. run planner dry-run → plan size + est cost
5. run `creative-generate-batch` with `mode=no_ai, limit=20` to populate real draft creatives across ≥8 categories
6. if `LOVABLE_API_KEY` balance ≥ $5, run AI batch `limit=5, dry_run=false` to prove path works (skipped otherwise — counted in report)
7. assert 0 rows inserted into `pinterest_pin_queue`
8. assert `/admin/creative-command` loads

## Hard limits enforced

- `max_per_run=20`, `max_usd_per_run=$15`, `per_product_per_day=4`, `videos_per_product_per_week=2`
- `dry_run_default=true`, `auto_generate_enabled=false`
- Eligibility filter: `is_active AND in_stock AND price>0 AND hero image hosted on supabase.co AND slug exists AND category_id NOT NULL`
- Idempotency: every function uses `run_id` + UNIQUE`(product_id, hook_hash, creative_type, run_id)` on `creative_assets`

## What is NOT built (deliberately deferred)

- Automatic publishing (admin approval required, every time)
- Expensive AI video rendering (`ad_video` storyboard rows stored as planning records only, no Cinematic V3 dispatch)
- Auto-replacement of live homepage/PDP visuals (only candidate records)
- Backfill of historical pin performance into new tables (covered by existing pinterest_intelligence stack; we read those tables, don't duplicate)

## Final report includes

Tables created, functions deployed, eligible product count, drafted creatives, estimated vs actual AI spend, categories covered, blocked duplicates, queue readiness, and next recommended admin action.

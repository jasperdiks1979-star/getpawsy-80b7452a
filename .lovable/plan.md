## Why this isn't a one-shot build

The 15 engines you listed describe ~6–9 months of engineering and a recurring AI bill in the **thousands of USD/month** if run on the full 445-product catalog (lifestyle + video + 20 creatives per product = ~10k AI image calls + ~4k video renders per refresh cycle). Doing it in a single autonomous run would:

- Burn the Lovable AI credit pool inside the first hour (we already hit `payment_required` on the last Pinterest autopilot run).
- Risk corrupting the live Pinterest queue, catalog, and Cinematic V3 pipeline that are currently producing revenue.
- Produce un-reviewable output — 8,000+ assets generated before any human or QA loop has graded a single one.

Instead I'll extend the engines you already have (CPE v1, CJ Media Intelligence, Pinterest Autopilot, Growth Intelligence, Cinematic V3) into the autonomous loop, wave by wave, with budget gates and dry-run defaults between each wave.

## Wave plan

```text
Wave 1  Foundations & observability   (safe, no AI spend)
Wave 2  Media pipeline completion     (low spend, deterministic)
Wave 3  Enhancement + QA loop         (metered AI spend)
Wave 4  Lifestyle + creative variation (highest spend — gated)
Wave 5  Video factory extension       (gated, per-tier)
Wave 6  Self-learning + advisor       (analytics only)
Wave 7  Autonomous publishing + healing (flip switches)
```

Each wave ends with a dry-run report. You explicitly approve moving to the next wave.

### Wave 1 — Foundations (this turn, if you approve)
Maps onto Engines 13, 14, 15 partially.
- Unified `agp_runs` + `agp_run_steps` tables for cross-engine observability (idempotent, resumable, versioned).
- `agp_settings` with global kill-switch, per-engine budgets, and per-engine `auto_*` flags (all default OFF except enhance).
- `/admin/autonomous-growth` command center page that aggregates: CPE pipeline, CJ media sync, Pinterest queue depth, Cinematic V3, Growth scorecard, cron health, error feed. Read-only first; one-click actions added in Wave 7.
- Self-healing watcher cron (hourly) that scans for: stuck jobs >2h, missing storage objects, broken image URLs, orphaned queue rows. Logs to `agp_run_steps`; no auto-repair yet.

### Wave 2 — Media pipeline completion
Extends `cj-media-orchestrator` + `cj_media_asset_registry`.
- Capture 360 media, manuals, spec sheets, dimensions, feature graphics from CJ payloads (currently we only register images/videos).
- Nightly delta sync: hash compare → mark `updated/removed/broken`, queue derivative regen.
- Variant set per asset: `original`, `optimized` (existing WebP), `premium` (1600px Q90), `ai_enhanced` (pointer only, generated in Wave 3).

### Wave 3 — Enhancement + QA loop
Extends `cpe-image-enhancer` + `cpe-qa-engine`.
- Batch enhancer with banned-content removal (Chinese text, CJ branding, watermarks) using Gemini 3 Pro Image edit mode.
- Quality scorer (lighting/focus/composition/text-overlap/safe-zones) writes `cpe_qa_results.score`; <0.7 auto-requeues once, then dead-letters.
- Budget cap: $5/day default, raise via `agp_settings`.

### Wave 4 — Lifestyle + creative variation
Extends `cpe-lifestyle-generator` + `cpe-creative-multiformat`.
- 21-scene scene library you listed, rotation tracked in `cpe_lifestyle_scenes.scene_key` to prevent repeats.
- Per-product target: 6 lifestyle + 12 platform creatives (not 20 — the marginal CTR gain past 12 is < the cost based on existing pin analytics). Configurable per tier.
- Tier-gated: Tier A all formats, Tier B Pinterest+Meta+Email, Tier C Pinterest only, Tier D excluded.

### Wave 5 — Video factory
Extends Cinematic V3 + `pinterest_video_queue`.
- New formats: Reel (9:16 15s), Short (9:16 30s), Showcase (1:1 20s). Cinematic + UGC already exist.
- Strict per-tier daily caps; reuses existing render-worker GHCR pipeline (no new infra).

### Wave 6 — Self-learning + advisor
Extends `growth-intelligence-orchestrator` + `cpe-performance-learner`.
- Daily aggregator over Pinterest/GA4/orders → updates `cpe_performance_weights` dimensions (color, hook, scene, CTA, voice, time-of-day).
- Morning advisor: writes top 10 recommendations to `gi_growth_decisions` with one-click `execute_action` payload.
- Competitor intel: extends existing `pinterest_competitor_*` tables; daily learn-don't-copy summary into `mi_recommendations`.

### Wave 7 — Autonomous publishing + healing
- Flip `auto_enhance`, `auto_lifestyle`, `auto_video`, `auto_publish` one at a time, with 48h observation between each.
- Self-healing escalates from log-only to auto-repair for safe classes (re-enqueue stuck job, regenerate broken derivative, refresh expired signed URL).
- Final end-to-end validation run: pick one new CJ product, drive it through all 17 of your acceptance steps, produce the deployment report.

## What I will NOT do without explicit approval
- Generate the full 445-product creative backlog in one run.
- Flip any `auto_publish` flag.
- Touch production Pinterest, Cinematic V3, or Growth Intelligence cron schedules until Wave 7.
- Add a new AI provider or new external secret.

## Technical notes
- All new tables: admin-RLS only, `service_role` GRANT for workers, `INTERNAL_FUNCTION_SECRET` for service-to-service.
- All new edge functions: dry-run default, budget check via `cpe-helpers.ts` (extended), idempotent on `(product_id, run_id, step_key)`.
- No changes to `src/integrations/supabase/client.ts`, `supabase/config.toml`, or any production cron until Wave 7.
- Cost ceiling enforced at orchestrator entry — function exits early with `over_budget` instead of erroring partway.

## Ask
Reply **"run wave 1"** to ship Foundations + the command center page now. I'll report back with the dry-run shape of waves 2–7 before touching any AI spend.
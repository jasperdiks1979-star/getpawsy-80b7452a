---
name: Pinterest hard cost controls v1
description: Per-run budget cap, deterministic-first image policy, QA hash memoisation, manual-resume gating, run-scoped backlog isolation, single cost ledger.
type: feature
---

**Default image model:** `google/gemini-2.5-flash-image`. `google/gemini-3-pro-image` is gated behind `allow_pro_image=true` AND `hero_priority=true` AND projected spend within cap — otherwise fail-closed to flash.

**Waterfall (deterministic-first):**
1. `composite_photo_lock` — no gateway call
2. `composite_bg_extend` — no gateway call
3. `flash_image_edit` — `google/gemini-2.5-flash-image`
4. `pro_image` — `google/gemini-3-pro-image` (gated as above)

**Retry caps:** `MAX_IMAGE_RETRIES=1`, `MAX_QA_RETRIES=1`. Every retry writes to `pinterest_render_attempts` + `pinterest_run_cost_ledger` with `retry_number`.

**QA memoisation:** every QA/PRE/vision/integrity scorer call MUST go through `runScoredWithCache()`. Cache key = `sha256(image_hash|pdp_hero_hash|product_id|scorer|scoring_version)`. Bypass only when `pinterest_run_config.force_rescore=true`.

**Source preflight (Control 5):** `runSourcePreflight` — deterministic + cached-only. Zero paid calls. Rejects on: CJ/supplier host, decode fail, occupancy <40%, identity <0.98, PDP similarity <0.97, species mismatch, watermark, supplier text, collage.

**Per-run budget (Control 6):** `pinterest_run_config` holds `max_credit_spend` (default 10 cr), `max_image_calls` (= pins+1), `max_qa_calls` (= pins+1), `manual_resume_required` (default true). `assertBudget()` throws `BudgetExceededError` BEFORE the paid call. Every paid call site MUST go through it.

**Red→Green guard (Control 7):** on any 402, run flips `status='paused'` with `manual_resume=false`. Green flip alone does NOT resume — only an explicit `manual_resume=true` re-invocation of `pinterest-wave-runner` unblocks paid work. Probes rate-limited to ≥15 min when no active non-paused run exists.

**Backlog isolation (Control 8):** every wave carries a unique `run_id`. Wave-runner selects candidates itself and only touches rows it inserted (`run_id` matches). Legacy rows have `run_id=NULL` and are never surfaced by the wave-runner.

**Cost ledger (Control 9):** `pinterest_run_cost_ledger` records every billable event (`run_id`, `queue_id`, `product_id`, `provider`, `model`, `operation`, `retry_number`, `input_tokens`, `output_tokens`, `image_count`, `provider_cost_usd`, `credits`, `success`, `image_hash`, `pdp_hero_hash`, `scoring_version`, `cached_hit`). `pinterest-run-summary` edge function reads it.

**Callable command (Control 10):** POST to `pinterest-wave-runner` with `{run_id, requested_pin_count, product_category, max_credit_spend?, allow_pro_image?, manual_resume?, hero_priority_slugs?, dry_run?}`. First call without `manual_resume=true` returns `awaiting_manual_resume`; second call with `manual_resume=true` starts the wave. Idempotent — safe to re-invoke with the same `run_id`.

**Enforcement choke-points:** `supabase/functions/_shared/pinterest-cost-guard.ts` (`assertBudget`, `assertNotPaused`, `recordLedger`, `pauseRun`), `pinterest-image-policy.ts` (`pickImageStrategy`, retry constants), `pinterest-qa-cache.ts` (`runScoredWithCache`), `pinterest-source-preflight.ts` (`runSourcePreflight`).

**Tests:** `supabase/functions/pinterest-wave-runner/index.test.ts` — 9 assertions covering budget cap, retry limit, paused-run gating, deterministic waterfall, pro-image gating, run_id isolation. Pure unit tests, no paid calls.

**Canonical lifecycle ownership (canary v1.1):**

| Stage | Owner | Status before → after | Paid? | Guard+Ledger |
|---|---|---|---|---|
| candidate selection | `pinterest-wave-runner` | (none) → (none) | no | n/a |
| source preflight | `_shared/pinterest-source-preflight` | (none) → (none) | no | 0-cr ledger row |
| queue insertion | `pinterest-wave-runner` | (none) → `queued` (deterministic) or `wave_draft` (needs render) with `run_id` | no | n/a |
| image gen (non-deterministic) | `pinterest-creative-director` | `wave_draft` → `draft` | YES | mandatory |
| QA / PRE | `pinterest-qa-cache` + director | `draft` → `draft`/`rejected` | YES | mandatory (+cache) |
| integrity guard | `_shared/pinterest-integrity-guard` | `draft` → `draft`/`rejected` | no | n/a |
| promote to queued | `pinterest-wave-runner` | `draft` → `queued` (`run_id` preserved) | no | n/a |
| board routing + POST | `pinterest-cron-worker` (isolation-aware) | `queued` → `publishing` → `posted` | no | n/a |
| live GET verify | `pinterest-verify-worker` | `posted` → `posted (verified_at)` | no | n/a |

**Wave isolation (`pinterest_runtime_settings.wave_isolation_active_run_id`):** while non-null, `pinterest-cron-worker` publishes ONLY rows whose `pinterest_pin_queue.run_id` matches — legacy `run_id IS NULL` backlog is skipped and logged to `pinterest_post_logs` with action `wave_isolation_skip`. Every legacy paid Pinterest edge function (`pinterest-creative-director`, `pinterest-creative-factory`, `pinterest-warmup-regenerate`, `pinterest-regen-autopilot`, `pinterest-recovery-worker`, `pinterest-noai-refill`) calls `assertIsolationAllows()` at entry and returns HTTP 423 when the caller's body `run_id` does not match. `pinterest-wave-runner` sets the flag before processing and clears it only when the run reaches `completed`.

**Per-pin financial caps:** `pinterest_run_config` now carries `max_credit_spend_per_pin` (default 1.0), `max_paid_image_calls_per_pin` (default 1), `max_paid_qa_calls_per_image_hash` (default 1), `max_total_paid_calls` (default 3). `assertBudget(sb, cfg, projected, kind, {queue_id, image_hash})` enforces all four in addition to the run-wide caps.

**Unit reconciliation:** `pinterest_run_cost_ledger.credits` = internal Lovable AI credits (dimensionless). `provider_cost_usd` is only populated when the gateway exposes it — otherwise NULL. Conversion `1 cr ≈ $0.10 ≈ €0.09` from `src/lib/aiPricing.ts` is an ESTIMATE, not billing truth.
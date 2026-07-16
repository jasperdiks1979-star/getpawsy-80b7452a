## Pinterest Hard Cost Controls — Implementation Plan

Scope covers all 12 controls. No paid AI calls, no pin renders, no publications during implementation. Dry-run tests only.

---

### 1. Database migrations (single migration file)

**New table `pinterest_run_config`** — per-wave budget contract.
Columns: `run_id uuid PK`, `wave_slug text`, `requested_pin_count int`, `product_category text`, `max_credit_spend numeric default 10`, `max_image_calls int`, `max_qa_calls int`, `allow_pro_image bool default false`, `manual_resume_required bool default true`, `manual_resume bool default false`, `status text default 'active'` (`active|paused|completed|aborted`), `paused_reason text`, `created_at`, `updated_at`. RLS on, admin-read, service-role write. GRANT block.

**New table `pinterest_run_cost_ledger`** — every billable event.
Columns: `id uuid PK`, `run_id uuid FK`, `queue_id uuid null`, `product_id uuid null`, `ts timestamptz default now()`, `provider text`, `model text`, `operation text` (`image_gen|image_edit|qa|pre|integrity|native|composite`), `retry_number int default 0`, `input_tokens int`, `output_tokens int`, `image_count int`, `provider_cost_usd numeric`, `credits numeric`, `success bool`, `error_reason text`, `image_hash text`, `pdp_hero_hash text`, `scoring_version text`, `cached_hit bool default false`. Index on `(run_id, ts)`, `(queue_id)`, `(image_hash, pdp_hero_hash, scoring_version)`. RLS + GRANT.

**New table `pinterest_qa_score_cache`** — memoised QA/PRE/vision/integrity results.
Columns: `cache_key text PK` (= sha256(`image_hash|pdp_hero_hash|product_id|scorer|scoring_version`)), `scorer text`, `scoring_version text`, `image_hash text`, `pdp_hero_hash text`, `product_id uuid`, `result jsonb`, `passed bool`, `credits_saved numeric default 0`, `created_at`. Index on scorer+version. RLS + GRANT.

**Extend `pinterest_pin_queue`**:
- `run_id uuid null` (backlog isolation key)
- `hero_priority bool default false`
- `image_hash text null`
- `pdp_hero_hash text null`

**Extend `pinterest_render_attempts`**:
- `retry_number int default 0`
- `image_model text`
- `image_hash text`
- `cost_credits numeric`
- `abort_reason text` (`cap_projection_exceed|preflight_fail|manual_resume_required|retry_limit`)

---

### 2. New shared modules (`supabase/functions/_shared/`)

**`pinterest-cost-guard.ts`** — the single enforcement point every paid call goes through.
- `loadRunConfig(supabase, run_id)`
- `currentRunSpend(supabase, run_id)` — sums `pinterest_run_cost_ledger.credits`
- `assertBudget(run_id, projected_credits, op)` → throws `BudgetExceeded` before the call
- `recordLedger(entry)` — always called (success or failure) with the pre-computed cost
- `assertNotPaused(run_id)` → throws `RunPaused` if `status='paused'` and `manual_resume=false`
- `pauseRun(run_id, reason)` sets `status='paused'`

**`pinterest-image-policy.ts`** — Control 1 + 2.
- `pickImageStrategy({ candidate, config })` returns one of `composite_photo_lock | composite_bg_extend | flash_image_edit | pro_image` in that order. Pro image requires `config.allow_pro_image && candidate.hero_priority && projected_within_budget`; otherwise fail-closed to `flash_image_edit`. Deterministic composite is chosen whenever the PDP hero passes preflight and no scene edit is required by the brief.
- `MODEL_ID_MAP` = `{ flash_image_edit: 'google/gemini-2.5-flash-image', pro_image: 'google/gemini-3-pro-image' }`.
- Constants `MAX_IMAGE_RETRIES = 1`, `MAX_QA_RETRIES = 1` exported here.

**`pinterest-qa-cache.ts`** — Control 4.
- `sha256Hex(bytes)`
- `buildCacheKey({image_hash, pdp_hero_hash, product_id, scorer, scoring_version})`
- `getCached(supabase, key)` / `putCached(supabase, key, result)`
- `runScoredWithCache(...)` wraps any scorer call; on hit, writes a ledger row with `cached_hit=true, credits=0` and returns cached result.
- Bypass only when `force_rescore=true` is set in run config.

**`pinterest-source-preflight.ts`** — Control 5.
- `runSourcePreflight(candidate)` → runs deterministic checks first (decode, occupancy ≥40%, watermark/text OCR, collage detector heuristic, species classifier via cached model, PDP similarity via perceptual hash, identity confidence ≥0.98 via cached vision result). All are cached via `pinterest-qa-cache`. Returns `{pass:boolean, failed:[]}`. If fail → candidate rejected with zero paid calls.

**`pinterest-credit-guard.ts`** (extend existing) — Control 7.
- Change `probePausedState` cron cadence to 15 min (already close; enforce min interval in-code).
- New `requireManualResumeAfterRed(run_id)`: on any red event during a run, set run `status='paused', paused_reason='credit_state_red', manual_resume=false`. Auto-resume from green flip does NOT flip `manual_resume`.
- `pinterest-credit-probe` cron: keep 10-min tick but skip probe when there's no active non-paused run (avoid needless probes).

---

### 3. Edge function changes

**`pinterest-creative-director/index.ts`** (patch):
- At entry: read `run_id` from body, `assertNotPaused`, load config.
- Replace hard-coded `google/gemini-3-pro-image` with `pickImageStrategy(...)`.
- Wrap image render in `assertBudget(projected)` → call → `recordLedger`.
- Wrap QA/scorer call in `runScoredWithCache`.
- Enforce `MAX_IMAGE_RETRIES=1`, `MAX_QA_RETRIES=1` (previous `MAX_RETRIES=2` is removed).
- Every render attempt writes to `pinterest_render_attempts` with `retry_number`, `image_model`, `image_hash`, `cost_credits`, `abort_reason` when aborted.

**`pinterest-cron-worker/index.ts`** (patch):
- Only claim rows where `run_id = active_run_id` (from `pinterest_run_config` where `status='active' AND manual_resume=true`). Rows with null `run_id` are skipped (legacy backlog isolation).

**New edge function `pinterest-wave-runner/index.ts`** — Control 10, resume-safe.
- Body: `{run_id, requested_pin_count, product_category, max_credit_spend?, allow_pro_image?, manual_resume?, hero_priority_slugs?}`.
- On first call: upsert `pinterest_run_config` with derived defaults (`max_image_calls = requested_pin_count + 1`, `max_qa_calls = max_image_calls`, `manual_resume_required = true`). Returns `{status:'awaiting_manual_resume'}` unless `manual_resume=true` was passed.
- On resume: selects candidates, runs preflight, dispatches to creative-director per candidate, respects budget, terminates cleanly when any limit hits. Idempotent — can be re-invoked with same `run_id`; it will read the ledger and continue from remaining budget.
- Returns run summary (see Control 9).

**New edge function `pinterest-run-summary/index.ts`** — read-only.
- Body: `{run_id}`. Returns `{spend_credits, remaining_budget, image_calls, qa_calls, retries, published_pins, rejected_pins, cost_per_published_pin, status, paused_reason}` computed from `pinterest_run_cost_ledger` + `pinterest_pin_queue`.

---

### 4. Tests (`supabase/functions/pinterest-wave-runner/index.test.ts`)

Deno test suite, all dry-run (mock `aiGatewayFetch` + service-role supabase client):
- **A** occupancy 30% → preflight rejects, zero ledger rows with `provider='gemini'`.
- **B** unchanged hash → second QA call returns cached, ledger row `cached_hit=true, credits=0`.
- **C** second image retry request → thrown `RetryLimitExceeded`, ledger records `abort_reason='retry_limit'`.
- **D** projected spend > cap → `BudgetExceeded` thrown before mock gateway call.
- **E** red event mid-run → run flips paused; green flip alone does not resume; only `manual_resume=true` re-opens.
- **F** row with different `run_id` → worker skips it.
- **G** composite path chosen → `pickImageStrategy` returns `composite_photo_lock`, no gateway call.
- **H** `allow_pro_image=false` but pro requested → falls back to flash-image; ledger model = `google/gemini-2.5-flash-image`.

---

### 5. Deliverables

Files changed / added:
- Migration: `supabase/migrations/<ts>_pinterest_cost_controls.sql`
- New: `supabase/functions/_shared/pinterest-cost-guard.ts`, `pinterest-image-policy.ts`, `pinterest-qa-cache.ts`, `pinterest-source-preflight.ts`
- Patched: `supabase/functions/_shared/pinterest-credit-guard.ts`, `pinterest-creative-director/index.ts`, `pinterest-cron-worker/index.ts`, `pinterest-credit-probe/index.ts`
- New: `supabase/functions/pinterest-wave-runner/index.ts`, `pinterest-run-summary/index.ts`, `pinterest-wave-runner/index.test.ts`
- Memory: `mem://marketing/pinterest-cost-controls-v1`

Enforcement point (single choke): every paid AI call in `pinterest-creative-director` and `pinterest-wave-runner` MUST go through `pinterest-cost-guard.assertBudget` + `pinterest-image-policy.pickImageStrategy` + `pinterest-qa-cache.runScoredWithCache`. No direct `aiGatewayFetch` for image/QA outside this path.

Runtime effect (previous → new):
- Default image model: `google/gemini-3-pro-image` → `google/gemini-2.5-flash-image` (~3.7× cheaper).
- Retry ceiling: 2 hidden → 1 recorded.
- QA re-scoring: every attempt → hash-memoised (5:1 → ~1:1 ratio).
- Budget cap: none → 10 cr default per wave, hard-abort before call.
- Post-red resume: automatic → manual-only.
- Backlog: any row eligible → only rows matching active `run_id`.

Post-implementation report will include the exact PASS/FAIL matrix for tests A–H, confirmation of zero paid AI calls, zero pin publications, and the new callable command signature for future waves.

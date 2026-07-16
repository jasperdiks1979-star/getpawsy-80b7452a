
# Pinterest Cost-Control Closeout + 1-Pin Canary

Scope is deliberately narrow: close the four unresolved gaps in the v1 controls, then execute exactly ONE canary pin end-to-end. No 10-pin wave. No legacy backlog. Hard cap = 1.0 credit run / 1.0 credit per pin / 1 paid image call / 3 total paid calls.

## A. End-to-end ownership trace (documented, no code)

Written up in `.lovable/mem/marketing/pinterest-cost-controls-v1.md` as an appended section. Owner per stage in the new canonical path:

```text
Stage                     Owner                          Row status before → after     Paid? Guard+Ledger
─────────────────────────────────────────────────────────────────────────────────────────────────────────
candidate selection       pinterest-wave-runner          (none) → (none)               no    n/a
source preflight          _shared/pinterest-source-...   (none) → (none)               no    ledger row (0cr)
queue insertion           pinterest-wave-runner          (none) → wave_draft(run_id)   no    n/a
image strategy pick       _shared/pinterest-image-...    wave_draft → wave_draft       no    n/a (decision only)
image gen / composite     pinterest-creative-director    wave_draft → draft            YES*  MANDATORY
QA                        _shared/pinterest-qa-cache     draft → draft                 YES*  MANDATORY (+cache)
PRE                       pinterest-creative-director    draft → draft|rejected        YES*  MANDATORY (+cache)
integrity guard           _shared/pinterest-integrity-.. draft → draft|rejected        no    n/a
promote to queued         pinterest-wave-runner (new)    draft → queued(run_id)        no    n/a
board routing             pinterest-cron-worker          queued → queued               no    n/a
Pinterest POST            pinterest-cron-worker          queued → publishing → posted  no    n/a
live GET verify           pinterest-verify-worker        posted → posted (verified_at) no    n/a
DB reconciliation         pinterest-verify-worker        sets verified_url, board_id   no    n/a
terminal status           cron/verify                    posted|rejected|failed        no    n/a
```
*YES = passes through `assertBudget` + `recordLedger` in `pinterest-cost-guard.ts`.

## B. Gap fixes (minimum-diff)

### B1. `pinterest-cron-worker` claim-query patch
Today it claims `status IN ('queued','approved','draft')` with no `run_id` filter. Change: extend the SELECT to include `run_id`, and add an explicit skip for `wave_draft`. When a `pinterest_run_config` row exists in `status='active'` with `run_id=X`, restrict the claim to rows where `run_id=X OR run_id IS NULL` behind a new runtime setting `wave_isolation_active_run_id`. Default OFF preserves legacy behavior. Wave-runner sets/clears the setting.

### B2. `wave_draft` → `queued` promotion
`pinterest-wave-runner` currently leaves rows as `wave_draft`, which no publisher picks up. Add a step at the end of `processCandidate` (after integrity guard passes) that flips the row to `status='queued'` and stamps `run_id`. Cron-worker's existing `in("status", ["queued","approved","draft"])` will then pick it up under the isolation flag from B1.

### B3. `pinterest-creative-director` paid path retrofit
Wrap EVERY `aiGatewayFetch` / model call in creative-director with `assertNotPaused` + `assertBudget` + `recordLedger`. Replace hard-coded `google/gemini-3-pro-image` default with `pickImageStrategy(cfg, hint)` from `pinterest-image-policy.ts`. Fail-closed when the row has no `run_id` and no `pinterest_run_config` exists (legacy path becomes read-only: it may still run deterministic composite paths, but paid calls throw `MissingRunContractError`). This kills the "unmetered legacy paid call" risk.

### B4. Other paid Pinterest functions
Audit list, wire through cost-guard or hard-disable during canary:
- `pinterest-creative-factory` — insert `assertNotPaused` at entry; refuse when `wave_isolation_active_run_id` is set and body has no matching run_id.
- `pinterest-warmup-regenerate`, `pinterest-regen-autopilot`, `pinterest-recovery-worker`, `pinterest-noai-refill` — same guard.
- QA/PRE scorers — route through `runScoredWithCache`.
No changes to non-paid publish/verify functions.

## C. Hard financial limits

Migration adds columns to `pinterest_run_config`:
- `max_credit_spend_per_pin numeric(10,4) DEFAULT 1.0`
- `max_paid_image_calls_per_pin int DEFAULT 1`
- `max_paid_qa_calls_per_image_hash int DEFAULT 1`
- `max_total_paid_calls int DEFAULT 3`

`assertBudget` extended to check per-pin spend (sum ledger where `queue_id = X`) and per-hash QA count (sum ledger where `image_hash = X AND operation='qa'`). Same fail-closed pattern.

### Unit reconciliation (report only, no conversion assumed)
- Ledger `credits` = internal Lovable AI credits (dimensionless).
- Provider cost = USD when the gateway response exposes `x-cost-usd`; else NULL.
- Lovable workspace balance = credits (same unit as ledger).
- Conversion: `USD_PER_CREDIT=0.1` and `EUR_PER_USD=0.93` already declared in `src/lib/aiPricing.ts` — treated as ESTIMATE, not billing truth.
- Canary cap `max_credit_spend=1.0` is 1.0 credit ≈ $0.10 est. ≈ €0.09 est. Report will state both units and mark the euro figure ESTIMATE.

## D. Canary candidate selection

Query (in migration file as a one-off SELECT for documentation; actual run in wave-runner):
```sql
SELECT id, slug, image_url FROM products
WHERE is_active=true AND primary_species='dog'
  AND slug NOT IN (SELECT DISTINCT product_slug FROM pinterest_pin_queue WHERE product_slug IS NOT NULL)
  AND slug NOT IN (SELECT slug FROM discontinued_products)
LIMIT 20;
```
Then run `runSourcePreflight` on each; take the FIRST that passes. Prefer `strategy='composite_photo_lock'` from `pickImageStrategy` so zero paid image calls are needed.

## E. Canary execution

Single `POST /functions/v1/pinterest-wave-runner` with:
```json
{
  "run_id": "canary-<utc-timestamp>",
  "requested_pin_count": 1,
  "product_category": "dog",
  "max_credit_spend": 1.0,
  "allow_pro_image": false,
  "manual_resume": true,
  "dry_run": false
}
```
Wave-runner picks 1 candidate → preflight → composite → QA(cached) → integrity guard → promote to `queued` with `run_id`. Then invoke `pinterest-cron-worker` ONCE with `wave_isolation_active_run_id=canary-…`; it picks that single row, publishes, gets a `pinterest_pin_id`. Then `pinterest-verify-worker` GETs the pin.

Terminal states enforced: at the end wave-runner marks the run `completed` or `paused`; any row still in `wave_draft`/`draft`/`processing` after the cron tick is flipped to `technically_deferred` with a reason.

## F. Live verification

`pinterest-verify-worker` already exists and does GET /pins/{id}. Extend it to return a canary-shaped payload: `{pin_exists, is_public, image_url_match, title_match, destination_match, destination_http_status, board_id_match, duplicate_scan}`. Board mismatch → `POSTED_WITH_BOARD_WARNING`; anything else that fails → `TERMINAL_REJECTED`.

## G. Negative safety tests (added to `pinterest-wave-runner/index.test.ts`)

Nine new pure unit tests covering: NULL run_id row skipped by cron claim query when isolation flag set; second candidate refused because `requested_pin_count=1`; pro-image call refused with `allow_pro_image=false`; second QA on same image hash returns cache hit (no ledger row); post-pause invocation without `manual_resume=true` returns `awaiting_manual_resume`; projected cost > cap throws `BudgetExceededError` before provider fetch; per-pin cap enforced independently of run cap; per-hash QA cap enforced; unledgered paid call impossible (creative-director throws `MissingRunContractError`).

## H. Final report format

Delivered inline as the chat reply after the canary completes, following the exact structure in the user request (Architecture / Canary / Safety, plus PASS/FAIL verdict).

## Deliverables

1. Migration: add 4 columns to `pinterest_run_config`, new `pinterest_runtime_settings.wave_isolation_active_run_id text`.
2. `_shared/pinterest-cost-guard.ts`: add per-pin & per-hash checks + `MissingRunContractError`.
3. `pinterest-cron-worker/index.ts`: patch claim SELECT + isolation flag + `wave_draft` skip.
4. `pinterest-wave-runner/index.ts`: promote `wave_draft`→`queued`; set/clear isolation flag; final terminal-status pass.
5. `pinterest-creative-director/index.ts`: route all paid calls through guard + `pickImageStrategy`; fail-closed when no run contract.
6. Entry-guard on the 4 legacy paid functions listed in B4.
7. Extend `pinterest-verify-worker` return payload.
8. Extend test suite with 9 negative-safety cases.
9. Update `.lovable/mem/marketing/pinterest-cost-controls-v1.md` with ownership table.

## What happens during implementation

Zero paid AI calls. Zero Pinterest POSTs. Only after the user approves this plan AND explicitly says "run the canary" do we invoke `pinterest-wave-runner` with the canary body above.

## Risks / open questions

- Cron-worker has ~30 downstream gates (overlay, dedupe, US-score, etc.). Any one of them can turn the canary into `rejected`. That's an acceptable terminal state per the request but will show as `TERMINAL_REJECTED` in the final report, not `POSTED`.
- If NO candidate passes preflight in the 20-row sample, canary ends as `BUDGET_STOPPED` with zero spend (still terminal, still PASS-eligible under the request's own rules? The request lists this as terminal but PASS requires "exactly one canary pin reaches a terminal state" — a preflight-only rejection would leave zero pins in any lifecycle. Please confirm whether that counts as PASS or FAIL before we start.).

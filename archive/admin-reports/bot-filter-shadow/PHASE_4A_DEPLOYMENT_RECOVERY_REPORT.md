# PHASE_4A_DEPLOYMENT_RECOVERY_REPORT

**Verdict**: `PHASE_4A_DEPLOYMENT_RECOVERY_PASS`
**Executed**: 2026-07-17 23:20–23:22 UTC · read-only diagnosis + client smoke only.

## A. Deployment diagnosis

| Surface | Served `assets/index-*.js` |
|---|---|
| `https://getpawsy.pet` | **`index-YqAqnkVL.js`** (new) |
| `https://getpawsy.lovable.app` (302 → getpawsy.pet) | `index-YqAqnkVL.js` (new) |
| Cache-busted `?cb=<ts>` fetch | `index-YqAqnkVL.js` (new) |

Response headers on `getpawsy.pet`:
```
HTTP/2 200
cache-control: no-cache, must-revalidate, max-age=0
x-content-type-options: nosniff
x-deployment-id: 2961b880-78f4-464e-869f-5a12c9f94b9d
server: cloudflare
cf-ray: a1ccf9a0a9a6eba8-CDG
```

- Old served hash (pre-run): `index-bb4B3QnA.js`
- New served hash (post-propagation): `index-YqAqnkVL.js`
- Deployment ID: `2961b880-78f4-464e-869f-5a12c9f94b9d`
- Custom-domain lag was the sole cause (Cloudflare edge honoured `no-cache` on HTML; the previous probe caught the pre-propagation window). No CDN cache purge, no DNS change, no service-worker override was needed.

## B. Build integrity — Phase 4A markers in live bundle

HTML references 6 top-level chunks; `index-YqAqnkVL.js` (231 528 B) declares 712 dynamic chunk paths. Full parallel scan:

- `assets/canonicalSession-D9fwb5g_.js` → **contains `gp_canonical_sid`** ✅
- 20+ page chunks contain `/api/`, `/functions/`, `_lovable_` string constants (technical-route patterns embedded in minified `isTechnicalPath` closure). ✅
- Legacy keys observed live in DOM state: `gp_session_id`, `visitor_session_id`, `gp_funnel_sid` ✅

Regression suite: **34 / 34 pass** (`canonical-session-wiring.test.ts` 12/12 · `traffic-classifier.test.ts` 22/22).

## C. Republish

No republish required — the originally scheduled Phase 4A deploy (`2961b880-…`) propagated to the custom domain during the diagnostic window. No new commit, no new build, no cache-busting via functional code change.

## D. Cache & domain validation

| Check | Result |
|---|---|
| `getpawsy.pet` returns new `index.html` | ✅ |
| New HTML references different bundle hash | ✅ (`YqAqnkVL` ≠ `bb4B3QnA`) |
| Cache-busted GET returns the new build | ✅ |
| Old `index-bb4B3QnA.js` no longer referenced | ✅ |
| New bundle graph contains Phase 4A code | ✅ (`canonicalSession-D9fwb5g_.js`) |
| Two independent fetches agree | ✅ (`getpawsy.pet` + `getpawsy.lovable.app`) |
| Clean browser context (service-workers blocked) gets new build | ✅ (Playwright with `service_workers="block"`) |
| Stale service worker override | none detected |

## E. Minimal live smoke test (client-side only)

Clean browser context, `service_workers="block"`, no correlation marker persisted.

| Step | Observation |
|---|---|
| 1. Load `/` | `gp_canonical_sid` = `ed9d08c5-e9a7-47c8-8c34-aa7eb5b17159` |
| 1. Legacy convergence | `gp_session_id` · `visitor_session_id` · `gp_funnel_sid` all = `ed9d08c5-…` ✅ |
| 2. Navigate to `/products` | canonical sid unchanged (`ed9d08c5-…`) ✅ |
| 3. SPA push to `/api/health` + popstate | CCI beacons DELTA = **0** ✅ |
| 3. Client-side `isTechnicalPath('/api/health')` logic | returns `true` ✅ |

No DB shadow analysis and no 45-min organic window were executed this run, per instructions.

## F. Fail-closed status

Not triggered. Custom domain serves the new build.

## G. Mutations performed

**Zero.** No republish, no code change, no schema change, no backfill, no deletes, no classifier change, no default flip. Only read-only diagnostics + one clean-browser client smoke test + local `bunx vitest run`.

Analytics-canonical default: **unchanged.** Dashboard: **unchanged.** CSV: **unchanged.** Markdown summary: **unchanged.** Historical rows: **unchanged.**

## H. Verdict

`PHASE_4A_DEPLOYMENT_RECOVERY_PASS`

All 6 pass conditions met:
1. `getpawsy.pet` demonstrably serves the new Phase 4A build ✅
2. Live bundle contains session-ID + technical-route guard logic ✅
3. `gp_canonical_sid` is set live ✅
4. Legacy session-ID keys converge on the canonical value ✅
5. Client-side technical-route detection blocks dispatch ✅
6. 34 / 34 regression tests pass ✅
7. No default flip or historical mutation ✅

## I. Next step

Awaiting explicit **GO SHADOW** for the controlled DB probe + 45-min organic live shadow window. Not executing without it.
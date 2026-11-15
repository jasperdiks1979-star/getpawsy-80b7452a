# Executed migration-preparation checks

Date: 2026-11-15. Source runtime/code: PR #62 head d80a758e172e8a9d4f253ccdd88ac02ad7fa35ab plus the cart-test teardown fix and standalone preparation tools on this branch. Runtime Node 24.22.1; installed Deno 2.5.6 in a disposable directory. No hosted CI executed.

| Check | Actual result | Scope/limits |
|---|---|---|
| Full repository clone | PASS | 5,564 tracked source files; single recovery branch with history |
| Locked npm installation | PASS | 927 packages, ignore-scripts, no dependency changes |
| App TypeScript | PASS after memory retry | First process exhausted default heap (134); retry with 8 GiB heap exited 0 |
| Node/build TypeScript | PASS | tsconfig.node.json, exit 0 |
| Full Vitest after fix | PASS | 192 files passed, 1 skipped; 3,036 tests passed, 2 skipped, no unhandled errors |
| Focused cart fixture | PASS | 15 tests; waits for asynchronous imports before teardown |
| Node stock contracts | PASS | 39 tests |
| Deno stock contracts | PASS | 34 tests |
| New preview configuration guards | PASS | 8 tests; production origin/live credentials/misplaced secrets rejected |
| PGlite stock database contract | PASS | Migration reapply, authorization, claim, backoff, replay rejection, unknown stock preservation, confirmed zero, checkpoint and exhaustion |
| Actual concurrent PostgreSQL test | NOT RUN | PostgreSQL server not available; PGlite is not concurrency proof |
| Full production build | FAILED / BACKEND BLOCKED | products_public unavailable (503); SEO/feed plugin refuses stale catalog reuse; exit 1 |
| Temporary UI-only Vite build | PASS after memory retry | No SEO/prerender/feed plugins or public assets; only a local UI test artifact, not deployable release evidence |
| Mobile/desktop checkout | BLOCKED | Chromium download failed; installed Chromium alternative cannot create required socket in this execution environment; all 8 stopped at launch, no app assertions executed |
| Full sync-stock Edge typecheck | BLOCKED | deno.land dependency connection refused, including one explicit proxy retry |
| npm audit | OPEN | 36 dependency findings: 0 critical, 18 high, 17 moderate, 1 low; no blind upgrades applied |
| Source DB size/export | BLOCKED | Lovable SQL query: database possibly not accessible; dashboard requires sign-in |
| Storage export and integrity | NOT RUN | No private storage inventory/download access established |
| Current checkpoint | NOT VERIFIED | 317/773 is the historical supplied checkpoint; no production write/reset |
| New backend, secrets, admin sign-in | NOT RUN | Both Supabase connections list zero projects |
| Hosted Cloudflare preview | NOT RUN | No Cloudflare account access established; backend/export gates unresolved |
| Stripe/CJ/e-mail end-to-end | NOT RUN | No real order/payment/provider calls initiated |
| release-validate.sh / rollback build | NOT RUN | Full build already fails; no fully tested release candidate |

Initial Vitest and production-build attempts ran concurrently. The build removed generated public feeds before failing on the inaccessible database, causing missing-file failures in that first test run. Those generated tracked files were restored from Git. A sequential rerun removed those false failures and exposed a genuine asynchronous teardown error in cart-integrity.test.tsx. The only change to an existing file is afterEach awaiting vi.dynamicImportSettled; the final full run above passes. Future full-build and test runs must be sequential or use separate worktrees.

The two skipped tests were reported by the existing suite and are not counted as passed. Pinterest remains outside release acceptance.

## Artifacts and safety

- PLAN.md: architecture comparison, capacities, component map, export/restore ordering and open gates.
- source-inventory.json: static names/paths only, including all 1,035 function entrypoints. Not a production export.
- migration-inventory.py: repeatable read-only scanner.
- migration-preview-preflight.mjs and test: configuration-only gate; does not verify actual remote secrets or block network traffic at runtime.
- Existing storefront, Edge functions, database schema, lockfiles and production configuration are unchanged.
- No exports of customer/order/auth records, credentials or password hashes have been placed in the repository.
- No Actions workflow was dispatched, no subscription started, no production batch, merge, publish or DNS change.

## External actions needed before continuation

1. Authorized access to the Lovable project dashboard to obtain the full database and storage exports. If the database is paused for credits, a free recovery/export route or provider assistance must be established; no purchase is authorized.
2. Select the destination Supabase organization (Getp is visible) and verify a $0 project quote; do not create a paid project.
3. Establish authorized Cloudflare access for a separate protected preview after the backend and artifact gates pass.
4. Re-run browser and actual PostgreSQL concurrency checks in a compatible isolated execution environment.

Do not treat earlier historical test evidence in PR #62 as proof of the new target infrastructure.

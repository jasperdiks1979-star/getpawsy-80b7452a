# Release status — 4 November 2026

NOT APPROVED FOR PUBLICATION. Main/production were not modified.

Candidate continues branch fix/local-release-validation-20261103 (PR60 + PR61 ancestry). The prior validated code candidate was 53f856b03ce4a965a1f472aa76f4680ed94e8cac. Additional security changes must not be treated as already deployed.

## Security repair

An unauthenticated GET to the live pinterest-connection-snapshot returned HTTP 200 with connection, publisher and queue data. The candidate now invokes requireInternalOrAdmin before constructing the data client. OPTIONS returns no private data; successful snapshots are no-store. Registered the endpoint in the existing deployed-authorization test inventory. The Pinterest operational E2E now requires an admin identity and fails explicitly when one is absent; operational assertions are retained. No credentials changed.

The shared audit-client type was corrected by deriving its type from a concrete factory rather than the generic createClient overload. Deno check of the snapshot and its imported guard passes. The guard test router previously omitted the existing user_roles fallback endpoint: it returned 404 and incorrectly expected 403 rather than 503. Added that fixture route and a fail-closed test for both role lookups failing.

Validation: 5 snapshot-boundary tests + 3 timer cleanup tests pass; full Vitest suite after snapshot change: 3040 pass, 0 fail, 2 skipped. Shared guard tests run with a local node:assert adapter because deno.land import was unreachable; the production code and HTTP stubs are unchanged by the adapter. No live authenticated success test or deployment validation has been performed.

## Remaining release blockers

- Live snapshot security fix is NOT deployed. Available Lovable publish operation is project-wide; no standalone function-deploy connector is available. Do not publish the unvalidated stock candidate merely to deploy this security fix.
- Stock scan: 317/773, running, last progress 2026-11-04 03:10:34.861 UTC. Both stock_sync_deferred and stock_sync_recovery_leases are absent in production. Independent bounded deferred retry worker remains missing. Implement and test claim/lease, retry exhaustion, crash recovery and atomic confirmed-stock completion before controlled migrations/deployment.
- Read-only CJ-linked catalog: 462 ok (444 positive stock), 100 no_data (38 positive stock), 211 discontinued (zero positive stock). Last 24h: 13 ok + 6 discontinued refreshed. This is the full linked catalog, not a count of storefront-visible products. Neither linkage nor historical positive stock proves current supplier availability.
- Dependency-upgrade experiment is not integrated or validated on this candidate. Do not transfer its claimed zero-critical result to the candidate lockfile.
- A full exact-commit release run (build, PostgreSQL, Edge and browser/checkout, rollback) is required after remaining changes. Prior passing results are historical evidence, not final release approval.

## Pinterest operational failure (separate from access-control vulnerability)

Read-only connection row: status auth_failed, last_account_status 200, last_boards_status 500, token_expires_at 2026-10-25 20:45 UTC, row updated 2026-10-23. Stored expiry is past; these historical fields do not prove whether revocation, refresh failure or a board API problem caused the original status. Reconnect via the admin OAuth flow and retest with an authenticated identity. Do not enable publishing or alter secrets merely to turn the test green. Pinterest publishing is not required by checkout, so this marketing outage alone need not block a separately validated storefront release.

No production migrations, supplier stock updates, real orders/payments, paid Lovable requests or new Actions runs were initiated.

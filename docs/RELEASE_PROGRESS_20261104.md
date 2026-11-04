# Release progress — 4 November 2026, continuation from d08c647

Not published. This record supersedes the missing-table status in RELEASE_STATUS_20261104.md.

## Production change actually performed

The additive migrations 20261101203000_stock_sync_recovery_lease.sql and 20261102181000_stock_sync_deferred_queue.sql were applied together in an explicit transaction with 3s lock and 15s statement timeouts. A precondition rejected any existing table/function to avoid replacing intervening changes. Existing products/sync_progress column types and service role/auth.role() were inspected first.

Both isolated PostgreSQL 18.6/PGlite contract suites passed before applying. Rollback was tested for an empty schema and rejection with existing recovery rows. scripts/rollback-stock-recovery-schema.sql must be used only before worker schema/activation; it deliberately refuses to erase recovery state. No scheduler was enabled and no product records were updated.

Post-deployment reads: both tables exist, zero records in each; anon cannot execute deferral and authenticated cannot claim recovery. Offset remains 317/773, latest stored progress 2026-11-04 03:10:34.861 UTC. This is schema preparation, NOT a successful supplier refresh.

## Implemented but not deployed

Independent service-role-only stock-deferred-worker endpoint delegates one bounded action to sync-stock. No recursive scheduling and no new secrets. SQL claim/finish functions use a durable token, five-minute crash lease, global worker gate, exponential retry intervals, three-attempt budget and terminal exhaustion. Completion rejects expired/replayed tokens, changed supplier mappings or newer stock observations. A new scan deferral invalidates an outstanding worker lease. Unverified observations preserve inventory; confirmed zero is persisted atomically with queue resolution. Scan status/counters remain conservative rather than falsely reporting completion.

Seven worker unit tests pass. Isolated PostgreSQL tests pass for authorization, exclusive sequential claims, backoff, wrong/replayed tokens, no_data preservation, confirmed zero, unchanged needs_review checkpoint and crash exhaustion. PGlite is real PostgreSQL compiled to WASM; these tests do NOT prove simultaneous claims across separate server sessions. A real concurrent PostgreSQL test and deployed integration validation remain required. Worker migration 20261104100000 is NOT applied. The standalone worker passes Deno check. sync-stock passes Deno check with local import adapters for unreachable deno.land/esm.sh (native Deno.serve and npm supabase-js); direct URL-import checking was network-blocked.

## Deployment access and remaining gates

A Supabase plugin with standalone deployment support was found but is not connected. No Supabase deployment access token/service key is available in the local environment. The connected Lovable tool can publish an entire project but provides no standalone Edge Function deployment operation. No credit-consuming Lovable agent request was made. Thus the protected Pinterest snapshot is still NOT deployed; it needs a function deployment route, followed by live anonymous/non-admin rejection and admin success checks. Do not merge/publish all stock code just to deploy the security patch.

Dependency upgrades are not included. Full final commit build/browser/payment and rollback validation remains pending. No full publication is authorized by these partial test results. No real orders, payments, ads, DNS, secrets or production stock changes were performed.

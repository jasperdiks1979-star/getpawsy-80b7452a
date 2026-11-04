# Edge Function deployment: Pinterest function + CJ retry worker

## Phase 1: read-only findings (verified)

1. **Repair commit 55c62ed is not in this project.** It does not appear anywhere in the project's history (the current head is 19123d217). So the tested repair code is **not** available here, and I can't compare it with production.
2. **The database part is live.** The `stock_sync_recovery_leases` table and the functions `claim_stalled_stock_sync_recovery(p_expected_offset)` and `defer_unverified_stock_sync_product(p_expected_offset, p_product_id, p_reason, p_message)` exist.
3. **No current backend function uses those database functions.** There is no CJ deferred retry worker in the project yet. Existing stock functions (`sync-stock`, `cj-stock-reconcile`, `cj-inventory-sync`, `p0-stock-truth-repair`) do not call them.
4. **"The secured Pinterest function" can't be identified.** There are more than 200 `pinterest-*` functions, and none of them is clearly the new secured version.
5. **Deployment behaviour:** every saved change under `supabase/functions/<name>/` deploys that function to production right away. This happens without a site publish and without an approval step. Only changed functions are deployed, but changes in `_shared/` also redeploy every function that imports them.
6. Progress 317/773 is NOT VERIFIED; I did not run a database query.

## Phase 2: deployment plan (after approval and once the code is supplied)

### What is needed from you
- The source of 55c62ed (upload the files of both functions plus the tests), **and** the exact name of the Pinterest function.

### Files (expected)
- `supabase/functions/<pinterest-function>/index.ts` (replace or new)
- `supabase/functions/cj-deferred-retry-worker/index.ts` (new)
- Tests next to them: `*_test.ts`
- No changes to `_shared/`, so no other functions redeploy as a side effect.

### Security
- Anonymous request → 401. Logged in without the admin role (`user_roles`) → 403. Scheduler: compare the secret header in constant time, otherwise 401.
- Input validated with Zod, otherwise 400. Default `dry_run=true`.

### Concurrency / crash recovery
- The worker claims work only through `claim_stalled_stock_sync_recovery(expected_offset)`. A second run with the same offset gets `false` and stops, so stock is never processed twice.
- Unverified products go through `defer_unverified_stock_sync_product` and never get a direct stock write.
- Tests: claiming in parallel lets only 1 run win; an expired lease can be taken over; the checkpoint never goes backwards.

### Dry run
- `dry_run=true` only reads and logs planned changes, with no writes to products or stock. One test call each, then check the logs.

### Rollback
- Restore the function files to their previous version (or delete the new worker), and they redeploy automatically. Disable the cron entry first if one exists. No data rollback is needed because the dry run writes nothing.

### Costs
- Estimate: about 2–4 Lovable credits (writing the code, Deno tests, one dry-run call each, and the log check). No other costs. No full webshop publish.

## Phase 3
Waiting for: (a) the code from 55c62ed, (b) the name of the Pinterest function, (c) your explicit approval.

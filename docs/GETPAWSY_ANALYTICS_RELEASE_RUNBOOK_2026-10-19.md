# GetPawsy analytics recovery — gated release runbook

Status: PREPARATION ONLY. **Do not merge, migrate, backfill, schedule, or deploy.**
Branch: `repair/browser-bot-evidence-v2-20261019`, PR #15.

## Verified findings
- `canonical_sessions` browser is missing for many recent sessions; `visitor_activity.browser` is populated. Browser labels are NOT verified user-agent or proof of human traffic.
- The existing `canonical_sessions_set_classified_channel` BEFORE UPDATE trigger recalculates commercial traffic classification on every update. Browser-only updates are therefore NOT isolated.
- The SQL opt-in repair deliberately raises an exception if `trg_canonical_sessions_zz_classify` remains enabled. This prevents accidental browser backfill. Never disable this trigger on production as a workaround.
- `canonical_session_apply_evidence` only derives user-agent from `crawler_visits`, which is not a complete source for ordinary sessions. Do not fabricate missing user-agents from browser labels.
- Shadow classifier uses `user_agent`, verified crawler evidence, activity hints, and stages; it does not use `browser` as human/bot proof.
- GitHub Actions blocked by confirmed billing balance; tests are not green.
- Read-only verification: production cron `analytics-shadow-classifier-hourly` is active at minute 23 each hour. Its latest recorded run used `v1-session-shadow`, scanned 1,056 sessions, wrote 34 derived labels, and reported no errors. This is an existing production scheduler, not one created by this PR.
- Recent bounded 200-session sample contained 330 activity evidence rows and 8 verified crawler rows. Larger windows can exceed conservative API caps; exact counts must be checked before classification.

## Gate 0: repository and environment identity
- Confirm current GitHub main HEAD, PR head SHA and Lovable workspace base. Do not reset or overwrite the newer main.
- Confirm separate staging database and edge environment, distinct secrets and nonproduction traffic.
- Record current production release SHA, function versions, and a rollback reference.

## Gate 1: offline code quality
- Install pinned dependencies from lockfile; run `npm ci`.
- Run `npm test -- --run` (or `npm test` if the package script already includes `vitest run`).
- Run `npx tsc --noEmit` and `npm run build`.
- Run `npm run edge:contract` where supported.
- Specifically exercise all 36 targeted tests (16 evidence + 11 completeness/checkpoint + 9 pagination); confirm no stale test fixtures.
- Confirm exact-count PostgREST reads return a count, and that failure never advances checkpoint beyond a failed write.

## Gate 2: database read-only preflight
- Check live RAM <=85% (prefer a safe margin), connections, long-running queries, and table sizes.
- Inspect triggers on canonical_sessions and current RPC definitions.
- Verify session/time joins, index support, and evidence coverage with bounded SELECT queries; no bulk scans.
- Verify PostgREST row limits and representative session volumes for 24h and 7d windows.

## Gate 3: staging only
- Deploy SQL migration in isolated staging; test that its safety block fires while the existing classification trigger is active.
- Design a reviewed alternative for browser enrichment that preserves commercial labels. Never disable the production trigger to force a pass.
- Verify before/after values for traffic_class, traffic_quality, is_internal, exclude_from_commercial, attribution, and timestamps.
- Test dry-run shadow classifier, partial failure/resume, evidence count truncation, missing user-agent, and high-volume sessions.
- Prove bounded execution, no duplicate session writes, and idempotent rerun.

## Gate 4: approval and limited production pilot
- Only after Gates 0-3 pass and billing/CI issue is resolved (or equivalent exact-head full suite is independently demonstrated).
- Review RAM, backups, function rollback, and deployment window.
- Run a deliberately small reversible pilot with pre/post snapshots and explicit stop conditions.
- Do not schedule automatic relabeling or run a seven-day backfill before the pilot has passed.

## Gate 5: monitor and rollback
- Compare bot/uncertain/human proportions, genuine checkout events, raw event counts, job failures and DB RAM.
- Roll back edge deployment on unexpected behavior; restoring the SQL function alone does NOT revert any previously changed rows.
- Keep raw event data immutable; avoid destructive cleanup.

## Open questions
1. Reliable first-party collection of user-agent / verified automation signals without treating Chrome viewport as proof.
2. Safe, trigger-compatible browser enrichment that does not change commercial labels.
3. Evidence pagination beyond the current conservative 1,000-row cap, without high RAM/DB load.
4. Hourly shadow job is active; verify lease/checkpoint behavior and that any future deployment cannot silently change classification of all sessions on its next scheduled run.

## Additional source-of-truth findings (read-only)
- `canonical_events` has both `browser` and `source_user_agent` columns, but in a bounded recent 1,000-event sample **zero** records had either field populated. This means the browser/user-agent gaps start upstream of the session rollup. Do not simply copy a Chrome browser label into user_agent.
- `canonical_session_upsert_recent` can only carry browser values that already exist in `canonical_events`; it does not populate `source_user_agent` into `canonical_sessions.user_agent`.
- `canonical_session_apply_evidence` can enrich user_agent only from crawler_visits; ordinary sessions remain uncovered.
- `visitor_activity.browser` contains client-side browser labels and may help diagnostic dashboards, but cannot prove a verified browser or human shopper.

## Browser repair trigger-compatible design (STAGING ONLY)
1. Snapshot representative canonical_sessions rows including `traffic_class`, `is_internal`, `exclude_from_commercial`, `classification_reason`, `bot_name`, `classifier_version`, `traffic_quality`, attribution fields and `updated_at`.
2. Do NOT bypass the BEFORE UPDATE trigger in production. In staging, evaluate changing the trigger function so it preserves existing classification fields when **only** browser changes, while still reclassifying when its actual inputs change. Include every dependency (`user_agent`, referrer, UTMs, click IDs, landing path, crawler_identity, interaction_count); INSERT must still classify.
3. Test that a browser-only update does not change any commercial field, while a relevant source-field update still correctly recomputes classification. Test existing first-touch attribution lock, validation trigger, concurrent updates and rollback.
4. Only after a safe, reviewed staging implementation should the opt-in browser RPC safety block be reconsidered. The current RPC is intentionally non-executable with the active production trigger.
5. Fix collection upstream separately: establish which first-party event ingestion endpoint has access to trusted request user-agent, whether it is retained under the site's privacy policy, and how to bind it to canonical session IDs. Never infer UA from a browser label or trust a client-supplied bot hint as verified crawler evidence.

## High-volume evidence pagination (branch code, unvalidated in staging)
- `evidence-pagination.ts` now provides stable ordered pages, exact-count checks, duplicate-ID checks, 10,000-row ceiling, 500-row pages and a 45-second job deadline.
- Reads are ordered by `created_at` then unique `id` and fail closed on truncation or inconsistent counts. Offset pagination is not a transactional snapshot; concurrent insert/delete with unchanged total counts is an unresolved integration risk.
- The full project suite and actual PostgREST integration remain pending. Do not publish the new Edge Function merely because the pure helper tests were added.

## Additional resume/lease release gates
- `dry_run=true` currently acquires and releases the lease and writes job metadata, but must **not erase an existing unfinished checkpoint**. This is not a strictly database-read-only operation; never call it on production without a rollout plan.
- New classifier versions must **not** resume a cursor from an older classifier version; checkpoint includes `version` and resets safely on mismatch.
- The function must report a lease-release failure as an error, rather than claiming successful completion. Inspect the lease row before retrying if this happens.
- Test scheduler overlap, expired lease takeover, failed write in middle of batch, and the first scheduled run after a version change in staging.

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

## Gate 0: repository and environment identity
- Confirm current GitHub main HEAD, PR head SHA and Lovable workspace base. Do not reset or overwrite the newer main.
- Confirm separate staging database and edge environment, distinct secrets and nonproduction traffic.
- Record current production release SHA, function versions, and a rollback reference.

## Gate 1: offline code quality
- Install pinned dependencies from lockfile; run `npm ci`.
- Run `npm test -- --run` (or `npm test` if the package script already includes `vitest run`).
- Run `npx tsc --noEmit` and `npm run build`.
- Run `npm run edge:contract` where supported.
- Specifically exercise all 19 targeted tests (10 evidence + 9 completeness/checkpoint); confirm no stale test fixtures.
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
4. Whether the hourly shadow job scheduler is active in production, and whether its checkpoint is healthy.

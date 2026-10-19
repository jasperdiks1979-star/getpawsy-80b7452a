# Isolated analytics staging laboratory — 19 October 2026

## Environment and boundaries
- Lovable project: **GetPawsy Safe Copy** (`78091082-8add-41c4-99bc-7c5b4c38201b`), **unpublished**.
- Production Lovable project: `597d7eb2-8207-4374-9ac1-67ffe0048ce1`.
- Distinct Supabase project hostnames verified from project `.env` configuration; do not paste credentials or tokens into logs.
- Staging DB is reachable via read/write SQL. It has **nine existing public tables** but lacks `canonical_sessions`, `visitor_activity`, and `analytics_job_leases`. There is no production-schema clone.
- All lab objects created ONLY in `analytics_repair_lab` schema. No writes to production, no writes to staging `public` commerce tables, no Lovable publish, no cron jobs, no Stripe actions.
- The lab uses a **simplified surrogate classifier**, NOT production `classify_channel_v2`. Results are preliminary and cannot certify a production migration.

## Lab objects
- `analytics_repair_lab.sessions`: synthetic session IDs, browser, user-agent, first-touch source, commercial and shadow labels.
- `analytics_repair_lab.activity`: empty synthetic evidence table.
- `analytics_repair_lab.test_results`: individual SQL test assertions.
- `analytics_repair_lab.lock_first_touch()`: simplified first-touch lock.
- `analytics_repair_lab.classify_on_source_change()`: simplified channel classifier.
- Trigger `trg_canonical_sessions_lock_first_touch`: BEFORE UPDATE; always enforces locked first-touch values.
- Trigger `trg_canonical_sessions_zz_classify`: BEFORE INSERT OR UPDATE OF source-input columns; **not** triggered by browser-only or shadow-label-only updates.
- Trigger names were deliberately changed to preserve production's alphabetical execution order: lock before classifier. Initial lab names sorted in the opposite order, an important subtlety uncovered during testing.

## Executed SQL assertions: 7 / 7 PASS
1. `browser_only_preserves_commercial_labels` — browser-only update preserves existing commercial label, channel and classifier version.
2. `user_agent_change_reclassifies` — headless user-agent update changes synthetic channel to crawler.
3. `utm_change_reclassifies` — source-input update recalculates channel.
4. `shadow_update_preserves_commercial_labels` — shadow quality/version update does not overwrite commercial fields.
5. `first_touch_browser_only_preserved` — locked first-touch values preserved on browser update.
6. `first_touch_lock_blocks_overwrite` — direct attempted overwrite of locked source/referrer is rejected by trigger logic.
7. `trigger_order_lock_before_classify` — locked source and derived channel agree when source update is attempted.

## Production read-only trigger inventory
1. `trg_canonical_sessions_lock_first_touch`: BEFORE UPDATE; `canonical_sessions_lock_first_touch()`.
2. `trg_canonical_sessions_zz_classify`: BEFORE INSERT OR UPDATE **on every update**; `canonical_sessions_set_classified_channel()`.
3. `trg_validate_traffic_quality_sessions`: BEFORE INSERT OR UPDATE; `validate_traffic_quality()`.

The live classification trigger calls `classify_traffic_source` and `classify_channel_v2` and depends on the effective referrer/source/medium, `user_agent`, `first_landing_path`, interaction count, `crawler_identity`, and the click-ID fields. An UPDATE OF trigger in a real migration must include **every** relevant source field, including first-touch and current referrer/UTM fields, all click-ID fields, crawler identity, landing path, user-agent and interaction count. Do not reuse the lab's abbreviated column list for production.

## Mandatory release gates still open
- Recreate a **production-equivalent** schema and trigger functions in staging without customer data, then run exact classifier and first-touch lock tests. This lab is not sufficient for that.
- Test column-specific triggers with `INSERT ... ON CONFLICT DO UPDATE`, attribution lock, repeated idempotent updates, NULL handling, bot evidence, race conditions, transaction rollback, and invalid quality validation.
- Check that the staging app's runtime endpoints, Edge Function secrets, webhooks, Stripe and scheduled jobs cannot access production. Separate `.env` Supabase hostnames alone are not enough.
- Run exact PR HEAD full Vitest/TypeScript/build and a bounded dry-run of the updated Edge Function. **Dry-run still updates lease metadata** and must not be called casually on production.
- Release only after RAM <85%, tested rollback and verified GitHub/Lovable sync.

## Current disposition
**STAGING LAB CREATED AND 7 ASSERTIONS PASSED. PRODUCTION RELEASE NOT AUTHORIZED.**

## Phase 2: copied actual production SQL functions (additional 15 / 15 PASS)
On the same isolated `analytics_repair_lab` schema, copied the **actual** production definitions of `classify_channel_v2`, `classify_traffic_source`, `canonical_sessions_lock_first_touch`, `canonical_sessions_set_classified_channel` and `validate_traffic_quality`, changing only schema qualifiers/search_path. Extended the synthetic sessions table with the actual trigger input/output columns. No production functions or data were modified.

Attached exact copied functions to staging triggers, with the new candidate **input-scoped** classifier trigger and the original always-on first-touch lock and quality-validation triggers. Verified these ten exact-classifier cases: Pinterest organic INSERT; browser-only update preservation; locked first-touch preservation; HeadlessChrome exclusion; shadow-only update preservation; no-signal UNKNOWN exclusion; Googlebot recognition; Lovable preview exclusion; Google Ads click-ID attribution; invalid traffic_quality rejection.

Also installed the **actual opt-in browser-backfill SQL RPC** in staging with only schema/table identifiers adapted to `analytics_repair_lab.sessions` and `analytics_repair_lab.activity`. Five additional SQL assertions passed: browser backfill preserves Pinterest attribution; second run is idempotent; future since rejected; batch >100 rejected; old all-UPDATE classifier trigger is rejected by the fail-closed trigger guard (then the input-scoped trigger was restored).

**Phase 2 result: 15 / 15 PASS. Cumulative isolated lab assertions: 22 / 22 PASS.**

## Phase 2 release artifacts
- `supabase/migrations/20261019170000_scope_canonical_classification_trigger.sql`: proposed reversible input-scoped production trigger migration, **not applied**.
- `supabase/migrations/20261019160000_canonical_browser_evidence_opt_in.sql`: updated to verify the trigger's complete input-column list before any browser backfill. No automatic backfill call.

## Remaining non-negotiable gates
- Exact production canonical_sessions table structure, RLS, indexes, foreign keys, concurrent writes and actual Edge Function invocation have not been cloned/tested; only a compatible lab table and exact copied trigger functions have been used.
- Full repository build, exact-head Vitest and checkout E2E remain unverified.
- Staging Edge Function secrets and webhook integrations are not fully audited.
- Do not apply migrations or run backfill in production until those gates and the RAM limit are cleared.


# Phase 4B — Admin Canary for `canonical_traffic_quality_v2`

Scope: expose the new traffic classification (post-deploy only) to admins behind a reversible feature flag. Leave every public/default path — dashboard, API defaults, CSV, markdown — untouched. No backfill. No default flip.

## A. Feature Flag

- Add row to existing `app_config` table (already present):
  - key: `canonical_traffic_quality_v2.enabled` → `false`
  - key: `canonical_traffic_quality_v2.admin_only` → `true`
- Client helper `src/lib/featureFlags/canonicalV2.ts`:
  - `useCanonicalV2Flag()` → reads `app_config` + `has_role(auth.uid(),'admin')`, returns `{ enabled, isAdmin, allowV2 }`.
  - Falls back to `false` on any error (fail-closed).
- Server helper `supabase/functions/_shared/canonicalV2Flag.ts`:
  - Reads `app_config` + verifies JWT + admin role via `has_role`.
  - Only returns `true` when both flag on AND caller is admin.

## B. API Envelope — `analytics-canonical`

Backward-compatible extension. All existing fields preserved unchanged.

- New query param `?envelope=v2` (only honored when server flag helper returns true).
- Legacy `envelope=v1` (default) returns the current shape byte-for-byte.
- v2 adds:
  ```
  raw_sessions, commercial_sessions,
  human_sessions, uncertain_sessions,
  crawler_sessions, bot_sessions, technical_sessions, internal_sessions,
  raw_visitors, commercial_visitors, human_visitors, uncertain_visitors,
  crawler_visitors, bot_visitors, technical_visitors, internal_visitors,
  classification_version, classification_coverage_pct,
  legacy_unclassified_sessions, phase4a_cutoff_iso
  ```
- Bucket rules (mutually exclusive, in order):
  1. `is_internal` → internal
  2. `technical_path IS NOT NULL` → technical
  3. `is_bot AND bot_confidence >= 0.7` → bot
  4. `traffic_quality = 'crawler'` → crawler
  5. `traffic_quality = 'uncertain'` → uncertain
  6. `traffic_quality = 'human'` → human
  7. else if `ingested_at < phase4a_cutoff` → legacy_unclassified
  8. else → uncertain (fail-safe, never counted as human)
- `commercial_sessions = human + uncertain` (never bot/crawler/technical/internal).
- Historical rows (before `2026-07-17T23:20:00Z`) always emitted as `legacy_unclassified`; NEVER folded into human.

## C. Admin Dashboard Canary

New route: `src/pages/admin/AnalyticsCanaryV2.tsx` mounted at `/admin/analytics/canary-v2`.
- Route guarded by admin `has_role` check + `useCanonicalV2Flag`.
- Layout: two columns.
  - Left "Huidige weergave (v1)" — calls existing endpoint, renders existing totals.
  - Right "Canary (v2)" — calls `?envelope=v2`, renders buckets.
- Bucket selector (default `Bezoekers (human + uncertain)`):
  - `Echte bezoekers` → human only.
  - `Bezoekers` → human + uncertain, with visible breakdown badge (`X human · Y uncertain`).
  - `Crawler/Bot`, `Technical`, `Internal`, `Raw` — each selectable.
- Legacy period ribbon: any bar/row before cutoff labeled `legacy_unclassified` and styled grey.
- Uncertain sessions never rendered as "proven human"; tooltip explains classification.

## D. CSV + Markdown Canary Export

- New edge function `analytics-canonical-export-v2` (admin+flag gated).
- Query params: `format=csv|md`, `period=1h|10h|24h|7d`.
- CSV columns: `session_id, occurred_at, traffic_quality, is_bot, bot_reason, bot_confidence, is_internal, technical_path, classification_version, engagement_ms, interaction_count, page_path, visitor_id`.
- Markdown: bucket totals table + parity block + `legacy_unclassified` line.
- Existing global CSV/markdown paths untouched.

## E. Parity Validation

New edge function `analytics-canonical-parity-check` (admin+flag gated, read-only).
For each period `1h / 10h / 24h / 7d`:
- Query API v2, dashboard aggregation SQL, CSV aggregation, markdown aggregation.
- Assert:
  - `raw = human + uncertain + crawler + bot + technical + internal + legacy_unclassified`
  - `commercial = human + uncertain`
  - technical never in human/uncertain
  - crawler/bot never in commercial
  - internal never in commercial
  - `orders` and `checkout_funnel_events` counts preserved between v1 and v2.
- Emits `PARITY_PASS` / `PARITY_FAIL` per period + JSON evidence.

## F. Historical Reporting (no backfill)

The v2 envelope includes:
- `classified_sessions_post_deploy`
- `unclassified_historical_sessions`
- `estimated_backfill_coverage_pct` = joinable by session_id / total historical
- `joinable_by_session_id`
- `joinable_by_visitor_fallback`
- `permanently_unclassifiable`

No writes to historical rows. `legacy_unclassified` bucket surfaced in UI.

## G. Safety & Rollback

- Rollback: set `canonical_traffic_quality_v2.enabled=false` in `app_config`. Client + server helpers immediately return false → dashboard renders v1 only, API drops v2 fields.
- No schema drop needed. No RLS change. No event deletion. No visitor-ID rewrite.
- Documented in `docs/phase-4b-rollback.md` with one-line SQL to flip flag.

## H. Tests

`supabase/functions/analytics-canonical/__tests__/v2-envelope.test.ts` and `src/lib/featureFlags/__tests__/canonicalV2.test.ts`. Covers all 10 requirements:
1. Flag on + admin → v2 buckets present.
2. Flag off → v2 fields absent, v1 identical to baseline.
3. Non-admin + flag on → v2 fields absent, 403 on canary route.
4. Commercial excludes bot/crawler/technical/internal.
5. Human-only excludes uncertain.
6. API/dashboard/CSV/markdown numeric parity (fixture dataset).
7. Historical row without classification → `legacy_unclassified`, never human.
8. Technical routes excluded from commercial in all four outputs.
9. Orders count identical between v1 and v2.
10. Flag flip false→true→false round-trip restores exact v1 response bytes.

## I. Rollback Proof

Run inside the test suite: enable flag, snapshot v2 API response, disable flag, snapshot v1 API response, assert v1 snapshot equals pre-enable v1 snapshot (byte-equal on the shared field subset).

## J. Final Report

Written to `/mnt/documents/PHASE_4B_ADMIN_CANARY_REPORT.md` with:
- files/functions changed
- feature-flag SQL
- canary screenshot (Playwright, admin login)
- example v1 vs v2 API JSON
- 4-period parity table
- classified vs legacy-unclassified counts
- test results (green)
- rollback proof snippet
- mutation ledger (only `app_config` inserts, `analytics_canonical` non-destructive extension, new files)
- confirmation: **zero historical backfill**, **zero destructive migration**, **default flag = false**.

## Guardrails Respected

- No default flip (`enabled=false` stays after deploy).
- No historical rewrite.
- No removal of the old analytics path.
- No raw event deletion.
- Old dashboard + old API path remain the sole default for every non-admin.

## Technical Details

- Files touched:
  - `supabase/migrations/<ts>_phase4b_canary_flag.sql` (2× `app_config` inserts).
  - `supabase/functions/_shared/canonicalV2Flag.ts` (new).
  - `supabase/functions/analytics-canonical/index.ts` (add v2 branch, gated).
  - `supabase/functions/analytics-canonical-export-v2/index.ts` (new).
  - `supabase/functions/analytics-canonical-parity-check/index.ts` (new).
  - `src/lib/featureFlags/canonicalV2.ts` (new).
  - `src/pages/admin/AnalyticsCanaryV2.tsx` (new).
  - `src/App.tsx` (add guarded route).
  - Tests as listed.
  - Docs: `docs/phase-4b-rollback.md`.
- No changes to: existing analytics-canonical response for `envelope=v1` / no param, existing dashboard components, existing export functions, existing RLS, existing schemas beyond `app_config` rows.
- Verdict returned at end: `PHASE_4B_ADMIN_CANARY_PASS` iff all 10 tests + 4 parity periods green and rollback proof passes; otherwise the corresponding failure verdict.

Awaiting approval to implement.

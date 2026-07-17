
# Bot Filter Fix — Shadow Rollout Plan (Phases 1–3)

Read-only audit conclusion (already delivered):
`BOT_FILTER_NOT_APPLIED_TO_REPORT` · root cause `BOT_FILTER_NOT_CONNECTED_TO_CANONICAL`.

This plan implements the fix in **shadow mode only**. No production default flip, no data mutation, no historical rewrite until you approve the shadow report.

---

## Scope guardrails (hard rules for this run)

- No `DELETE` on `canonical_events`, `canonical_sessions`, `visitor_activity`, `cci_events`.
- No `UPDATE` of existing rows during Phase 1–3 (only backfill dry-run reports).
- Schema changes are **additive** (new nullable / defaulted columns). Never drop, rename, retype.
- New classifier writes are opt-in via `?mode=shadow`; the existing `analytics-canonical` truth envelope stays the production default.
- Session-id unification only affects **new** events; historical rows stay as-is.

---

## Phase 1 — Implementation + Tests

### A. Schema (additive migration)

`canonical_events` (adds, all nullable/defaulted):
`is_internal bool default false`, `is_bot bool default false`, `bot_confidence numeric`,
`bot_reason text`, `traffic_quality text default 'uncertain'`, `classification_version text`,
`classified_at timestamptz`, `source_user_agent text`, `technical_path bool default false`.

`canonical_sessions` (adds): same nine + `engagement_ms int default 0`, `interaction_count int default 0`.

Validation via **trigger** (not CHECK — per platform rule): `traffic_quality ∈ {human,uncertain,bot,internal,technical}`.

Backfill defaults on existing rows via `UPDATE ... WHERE traffic_quality IS NULL` set to `'uncertain'` — this is the only allowed non-destructive touch and only fills defaults. No reclassification.

### B. Session-ID unification (writer-side, forward only)

Root cause of 0-overlap namespaces: multiple client writers (`cci_events`, `visitor_activity`, `checkout_funnel_events`) each mint their own session id.

Fix: create `src/lib/canonicalSession.ts` — single provider:
- Reads/writes `sessionStorage['gp_canonical_sid']` (uuid v4).
- 30-min inactivity timeout → new sid.
- Exported `getCanonicalSessionId()` used by: `useVisitorTracking`, `analyticsFunnel`, `sessionQuality`, `cci_events` writer, checkout writer.
- No fingerprinting, no PII, no cookies added.

Rollout gate: new module writes only. Legacy `gp_session_id` kept for backward compat; new writes emit **both** so the 30-day dedup key remains valid.

### C. Technical route exclusion (defence in depth, 4 layers)

```text
Layer 1  storefront tracker      → skip page_view when path matches TECHNICAL_PATTERNS
Layer 2  gtag page_view dispatch → same skip
Layer 3  canonical-ingest        → mark technical_path=true, traffic_quality='technical'
Layer 4  analytics-canonical     → exclude technical from human/uncertain buckets
```

`TECHNICAL_PATTERNS` (shared const, `src/lib/technicalRoutes.ts` + Deno mirror in `_shared/technical-routes.ts`):
`/api/`, `/functions/`, `/storage/`, `/favicon.ico`, `/robots.txt`, `/sitemap`, `/healthz`, `/.well-known/`, `/admin/`, `_lovable_preview`, image proxy patterns.

### D. Rules-based classifier (new)

`supabase/functions/_shared/traffic-classifier.ts`:

```text
input:  { page_path, user_agent, referrer, utm, is_internal_hint,
          is_bot_suspect_hint, bot_suspect_reason, engagement_ms,
          interaction_count, pageviews, has_atc, has_checkout }

decision order (fail-safe priority):
  1. internal   (existing internal/admin rules)
  2. technical  (TECHNICAL_PATTERNS match)
  3. bot        (hard signals only:
                  - crawler/spider UA regex
                  - Lighthouse / synthetic monitor UA
                  - headless UA + no interactions
                  - is_bot_suspect=true AND reason in HIGH_CONF_REASONS
                  - mechanical pattern + datacenter/automation evidence)
  4. human      (has_atc || has_checkout || interaction_count >= 3
                  || (pageviews >= 2 && engagement_ms >= 5000 && interaction_count >= 1))
  5. uncertain  (everything else — includes 0s bounces, single-PV direct,
                 lone VPN/datacenter signal, missing referrer)

output: { traffic_quality, is_bot, is_internal, technical_path,
          bot_confidence 0..1, bot_reason, classification_version: 'v1' }
```

Explicit non-rule: no hard `engagement_ms >= 3000 → human`. Engagement is a weighted input only.

### E. Ingest & session aggregation

`canonical-ingest` extended: after upserting an event, resolve classification via classifier using enrichment from `visitor_activity` on **shared session_id** (new) or `visitor_id` fallback (existing), write classification columns.

Session aggregation priority when merging per-session:
`internal > technical > bot > human > uncertain`. A single weak bot signal on an otherwise human session (has_atc/checkout) does **not** override human.

### F. Analytics-canonical truth envelope (shadow-capable)

New response fields under `bucket_counts`:
`total_raw_sessions, human_sessions, uncertain_sessions, bot_sessions, technical_sessions, internal_sessions` (+ `_visitors` variants).

Request modes:
- default (unchanged): today's `is_internal`-only filter → **production stays intact**.
- `?mode=shadow`: use new classification columns; response also includes `parity: { old_totals, new_totals, delta }`.
- `?bucket=human|human_uncertain|bot|technical|internal|raw`: explicit filter.

UI stays on the old default until Phase 4.

### G. Tests (`src/test/traffic-classifier.test.ts` — Vitest, ~20 cases)

Covers all 20 numbered regression cases from the request: `/api/img` never human, crawler UA → bot, Lighthouse → bot/technical, short session + ATC → human, headless long session → bot, VPN alone → uncertain, shared sid match, dashboard/CSV parity, raw totals unchanged, backfill idempotent, no visitor-per-event inflation, human filters exclude bot/technical/internal, orders preserved.

---

## Phase 2 — Shadow classification (dry-run only)

New edge function `analytics-shadow-classifier` (read-heavy, write-limited):

- Reads canonical_events for windows: 1h, 10h, 24h, 7d.
- Runs classifier per session using in-memory join with visitor_activity (session_id + visitor_id fallback).
- Writes classification columns **only for events in the target windows** (idempotent upsert, `classification_version='v1-shadow'`). This is the single allowed mutation in Phase 2 and is auditable — no rows deleted, no visitor_ids regenerated.
- Emits comparison report to `analytics_truth_snapshots` with `mode='shadow'`.

Explicit re-check of the audited 10h window: 216 sessions / 213 visitors / 699 events / 672 PV / 27 PDP / 5 `/api/img` / 276 `visitor_activity` bot suspects.

---

## Phase 3 — Read-only parity report (delivered to you)

Markdown + JSON containing:
1. Files & migration list.
2. Session-id root cause (multiple writers, no shared provider).
3. New schema diff.
4. Classifier rules table.
5. Technical route list.
6. Test results (pass/fail matrix).
7. Shadow bucket counts for 1h/10h/24h/7d.
8. Old vs new for the audited 10h window.
9. Human/uncertain/bot/technical/internal totals.
10. CSV & summary parity check.
11. Backfill dry-run summary (join coverage, unclassifiable count).
12. Mutations executed during shadow run (only classification column writes, listed with counts).
13. Proof production default unchanged: `analytics-canonical` default response still uses `is_internal`-only filter; dashboard hook unchanged.

Verdict: one of `BOT_FILTER_FIX_SHADOW_PASS` / `PARTIAL` / `FAILED` / `SESSION_NAMESPACE_FIX_FAILED` / `CLASSIFICATION_PARITY_FAILED`.

---

## Phase 4 — (Awaits your explicit GO)

Not executed in this run. Would flip `analytics-canonical` default to new classification and update dashboards.

---

## Deliverables in this run (Phase 1–3)

- 1 migration (additive schema + trigger).
- ~6 new/edited files: `technicalRoutes.ts` (client+Deno), `canonicalSession.ts`, `_shared/traffic-classifier.ts`, `canonical-ingest/index.ts` (classifier hook), `analytics-canonical/index.ts` (shadow mode), `analytics-shadow-classifier/index.ts` (new).
- Client writers updated to use shared session id (additive; keeps legacy id).
- Vitest suite.
- Shadow report markdown + JSON in `public/admin-reports/bot-filter-shadow/`.

## Confirmation of non-execution

- Production dashboard default: unchanged (verified by grep on `useCanonicalFunnel` — no code path switched).
- Historical `canonical_events` rows: only new columns filled with defaults + shadow classification; no `DELETE`, no `UPDATE` on business columns.
- Backfill remains dry-run.

Approve to proceed with Phase 1 implementation, or request changes.

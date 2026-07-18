
## Goal

Make the admin dashboard's default numbers reflect real, conversion-eligible human traffic — not raw sessions, bots, internal checks or NULL-country coerced to US. Keep raw data intact and inspectable.

## Root cause (traced)

1. `supabase/functions/analytics-canonical/index.ts` aggregates from `canonical_events` + `visitor_activity` and applies only one commercial filter: `cleanSessionsArr = sessionsArr.filter(s => !s.is_internal)`. It never consults `canonical_sessions.exclude_from_commercial`, `is_bot`, `technical_path`, or `traffic_quality`.
2. The dashboard's "US only" toggle uses `geo=US`, which filters `sessions.country` through `isUS()`. NULL country is correctly *not* coerced to US in the aggregation itself — but because 149/189 sessions in the last 5h have `country=NULL`, the toggle silently keeps only the ~7 US rows and hides everything else, while the KPI tile ("visitors") stays computed against the pre-filter set, producing the observed 55/55 mismatch.
3. `real_human_sessions` view already exists (mem://analytics/real-human-session-classifier) but no dashboard consumes it.

## Fix (minimal, surgical)

### 1. Database migration — `commercial_sessions` view + counters
- View `public.commercial_sessions` over `canonical_sessions`, predicate:
  `NOT is_internal AND NOT is_bot AND NOT technical_path AND NOT exclude_from_commercial AND traffic_quality IN ('confirmed_human','probable_human','human')`.
- View `public.commercial_country_totals_24h` grouping by `COALESCE(NULLIF(TRIM(country),''),'Unknown')` — never defaults to United States.
- GRANT SELECT to `authenticated`, `service_role`.

### 2. `analytics-canonical` edge function
- New session-join step: `canonical_sessions.select(session_id,is_internal,is_bot,technical_path,exclude_from_commercial,traffic_quality,traffic_class)` for the session_ids in-window.
- Stamp each `SessionAgg` with the resolved flags.
- Replace `cleanSessionsArr = filter(!is_internal)` with `commercialSessionsArr = filter(commercialPredicate)`.
- New response fields (additive, backward compatible):
  - `traffic_quality_breakdown`: `{ raw_sessions, commercial_sessions, excluded_internal, excluded_bot, excluded_technical, excluded_low_quality, unknown_country }`
  - `totals.human_visitors` (unique visitor_id over commercial set)
  - `totals.raw_sessions_all` (pre-filter count)
- Country aggregation keys stay `COALESCE(country,'Unknown')` — verified NULL never becomes 'US'.
- Purge cache key (`envelope`) unchanged.

### 3. Dashboard surface
- `CanonicalKpiStrip`: relabel "Visitors" → "Human visitors", add secondary "Raw sessions" chip, wire from new fields.
- `CleanAnalyticsPanel`: expose traffic-quality breakdown (small table with excluded categories).
- `VisitorWorldMap`: markers already read `truth.sessions` (already excludes internal). Add a legend note that map = human sessions; leave the auditable "usOnly" toggle intact and never coerce NULL to US in table totals.

### 4. Verification
- Direct SQL against 5h cohort before/after.
- Curl `analytics-canonical` on prod after deploy, assert `traffic_quality_breakdown` present and `totals.visitors <= raw`.
- Playwright screenshot of `/admin/live-map` at 375/768/1440 confirming "Human visitors" chip.

## Non-goals (explicit)

- No raw event deletion. No Pinterest writes. No paid credits.
- No changes to `visitor_activity` writer or classifier.
- Historical backfill limited to the view (retro-classifies aggregates; raw rows untouched).

## Files touched

- `supabase/migrations/<ts>_commercial_sessions_view.sql` (new)
- `supabase/functions/analytics-canonical/index.ts`
- `src/hooks/useAnalyticsTruth.ts` (new fields on `TruthResponse`)
- `src/components/admin/CanonicalKpiStrip.tsx`
- `src/components/admin/CleanAnalyticsPanel.tsx`
- One Playwright spec under `/tmp/browser/` for verification (not committed).

## Deliverable

`GETPAWSY_ANALYTICS_TRUTH_FIX_REPORT` with the 15 required sections and before/after numbers for the 5h cohort.

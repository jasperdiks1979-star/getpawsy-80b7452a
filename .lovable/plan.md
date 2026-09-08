# Fix slow admin analytics on long date ranges

## Confirmed problem

The single reporting service behind every admin dashboard rebuilds all
numbers from raw event rows each time. For short windows this is fine; for
the 30-day and 90-day windows it runs past the 150-second limit and the
request fails (504), so the dashboard shows an error or keeps loading. A
background refresher keeps retrying the 90-day window and keeps failing, so
that window never gets a usable cached result.

## Approach

1. Split the heavy work into day-sized chunks instead of one giant scan.
   Each chunk is aggregated separately and the daily totals are stored, so a
   long window is assembled from ~90 small pieces rather than one huge one.
2. Store the per-day rollups in a new table, refreshed by the existing
   background refresher. Long windows then read the rollups (fast) plus only
   today's live rows.
3. Keep the exact same response shape so no dashboard, export or hook needs
   to change.
4. Keep the existing cache and stale-serving behaviour as the safety net.
5. Make the background refresher skip a window it cannot finish, and record
   why, instead of retrying the same failing request every cycle.

## Technical detail

- New table `analytics_canonical_daily` (day, geo, aggregated counters,
  revenue, per-country and per-source breakdowns as jsonb), with GRANTs and
  RLS restricted to service role.
- New builder inside `supabase/functions/analytics-canonical` that computes a
  single UTC day and upserts it; the warmer calls it for missing/stale days.
- Read path: for `hours > 48`, sum rollup days and add a live tail for the
  current day; for `hours <= 48`, keep today's exact live computation.
- Session-level envelope (`sessions[]`) stays live-only and is capped for long
  windows, since it is only used by short-window panels.
- Verification: compare rollup output against the current live computation for
  24h/168h/720h windows and require totals to match within rounding, then
  measure 2160h runtime under the limit.

## Risk

Medium. Numbers must match exactly, so the plan keeps the live path as the
source of truth for short windows and gates the rollup path behind a parity
check before it serves anything.

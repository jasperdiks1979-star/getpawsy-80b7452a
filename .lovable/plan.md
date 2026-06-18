# Cinematic V3 Auto Dispatcher

End-to-end autonomous pipeline that keeps Cinematic V3 rendering 24/7 without manual triggers.

## 1. Database schema (migration)

New tables:

- **`cinematic_v3_dispatch_queue`** — pending products awaiting render
  - `product_id` (unique), `priority_score`, `priority_reason` (bestseller | traffic | no_pinterest | new), `status` (pending | dispatched | skipped), `attempts`, `last_error`, `enqueued_at`, `dispatched_at`
- **`cinematic_v3_dispatch_log`** — every dispatch event
  - `event_type` (enqueue | dispatch | skip | retry | watchdog | emergency | refill), `product_id`, `job_id`, `outcome`, `details` jsonb, `created_at`
- **`cinematic_v3_dispatch_config`** — single-row control
  - `enabled` bool, `min_queue_size` (10), `low_water_mark` (5), `max_retries` (3), `emergency_idle_minutes` (30), `last_dispatch_at`, `last_emergency_at`

All tables: GRANT to authenticated + service_role, RLS admin-only, no anon.

## 2. Edge functions

- **`cinematic-v3-auto-dispatcher`** (cron entry point, no JWT)
  1. Read config; abort if `enabled = false`.
  2. Skip emergency check: if `last_dispatch_at` older than `emergency_idle_minutes` AND any active job in `cinematic_v3_jobs` — log `emergency`, force run.
  3. Refill queue (watchdog): if `pending` queue size < `low_water_mark`, run selector until queue >= `min_queue_size`.
  4. Pick top-priority pending row, INSERT into `cinematic_v3_jobs` via `cinematic-v3-start`, mark queue row `dispatched`, log `dispatch`.
  5. On failure, increment `attempts`; if `attempts < max_retries` keep `pending`, else mark `skipped` and log.

- **`cinematic-v3-queue-refill`** (callable independently from dashboard)
  - Selector logic (priority order, deduped against approved jobs):
    1. Bestsellers — join `bestsellers` (rank asc).
    2. High traffic — `gi_product_performance_daily` last 7d sessions desc.
    3. No Pinterest content — products with 0 rows in `pinterest_pin_queue` / `pinterest_pins`.
    4. New products — `products.created_at` desc, last 30d.
  - Excludes: products with an `approved` v3 job, products already in queue, products in `pinterest_loser_blocklist`, discontinued.

## 3. Cron schedule

Via `supabase--insert` (not migration — contains anon key):

```sql
select cron.schedule(
  'cinematic-v3-auto-dispatcher',
  '*/15 * * * *',
  $$ select net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/cinematic-v3-auto-dispatcher',
    headers := '{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
    body := '{}'::jsonb
  ) $$
);
```

Ensures `pg_cron` + `pg_net` extensions enabled.

## 4. Admin dashboard

New route `/admin/cinematic-v3-dispatcher` (page `src/pages/admin/CinematicV3DispatcherPage.tsx`), linked from existing admin nav next to the QA page.

Panels:
- **Status header** — enabled toggle, last dispatch, last emergency, next cron tick (computed from `*/15`).
- **Queue size** with low/min thresholds, refill button.
- **Next product** card (top pending row).
- **Last dispatched product** with link to QA dashboard.
- **Last render result** (joined from `cinematic_v3_jobs` — status, qa_total, qa_passed).
- **Failed/retry table** — queue rows with `attempts > 0`.
- **Recent dispatch log** (last 50 events).

Auto-polls every 30s, gated to mounted route (same pattern as `CinematicV3QaPage`).

## 5. Activation

After migration approval:
1. Insert default config row (`enabled=true`).
2. Run initial refill so queue has ≥10 products.
3. Schedule cron job.
4. Manually invoke dispatcher once so the first render kicks off immediately.

## Technical notes

- `cinematic-v3-start` is called with service-role key from inside the dispatcher (server-to-server).
- All dispatcher SQL paths use `service_role`; dashboard reads use `authenticated` + `has_role(admin)`.
- Auto-verdict trigger from previous fix remains the single source of truth for `qa_passed` / `status='approved'`.
- Watchdog refill is idempotent: queue rows use `ON CONFLICT (product_id) DO NOTHING`.
- Selector caps a single refill batch at 25 candidates to keep the cron run under 10s.

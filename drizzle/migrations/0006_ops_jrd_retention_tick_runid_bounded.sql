ALTER TABLE public.ops_log_retention_state ADD COLUMN IF NOT EXISTS jrd_cursor bigint;
COMMENT ON COLUMN public.ops_log_retention_state.jrd_cursor IS 'runid cursor for ops_jrd_retention_tick (cron.job_run_details retention, runid-bounded).';

CREATE OR REPLACE FUNCTION public.ops_jrd_retention_tick(p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $f$
-- Scope: cron.job_run_details ONLY. Every access is bounded by the indexed runid (PK).
-- start_time/status are only evaluated inside a <=1000-runid window.
-- start_time is NOT strictly monotonic with runid (observed inversions ~1.2s), so
-- completion requires the whole window to be >= cutoff + 1 day (large margin), and
-- the newest 20,000 runids are never touched.
declare
  s public.ops_log_retention_state%rowtype;
  reason text; act int; waiters int; conns int; maxc int;
  h int := extract(hour from now() at time zone 'UTC');
  c_window constant bigint := 1000;
  c_keep_recent constant bigint := 20000;
  cutoff timestamptz := now() - interval '30 days';
  v_max bigint; v_ceiling bigint; v_lo bigint; v_hi bigint;
  v_rows int := 0; v_candidates int := 0; v_win_min timestamptz; v_win_max timestamptz;
  v_deleted int := 0; v_done boolean := false; t0 timestamptz; ms int;
begin
  perform set_config('statement_timeout', '5s', true);
  perform set_config('lock_timeout', '1s', true);

  select * into s from ops_log_retention_state where id = 1;
  select count(*) into act from pg_stat_activity where state='active' and pid<>pg_backend_pid() and backend_type='client backend';
  select count(*) into waiters from pg_locks where not granted;
  select count(*) into conns from pg_stat_activity where backend_type='client backend';
  maxc := current_setting('max_connections')::int;

  if s.id is null then reason := 'no_state_row';
  elsif not s.armed then reason := 'not_armed';
  elsif h < 2 or h >= 8 then reason := 'outside_window';
  elsif s.paused_until is not null and now() < s.paused_until then reason := 'paused_for_night';
  elsif pg_postmaster_start_time() > now() - interval '12 hours' then reason := 'recent_restart';
  elsif act > 10 then reason := 'active_queries=' || act;
  elsif waiters > 0 then reason := 'lock_waits=' || waiters;
  elsif conns >= maxc * 0.7 then reason := 'connections=' || conns;
  elsif coalesce(s.last_batch_ms, 0) > 3000 then reason := 'previous_batch_slow=' || s.last_batch_ms;
  end if;

  if reason is not null and not p_dry_run then
    update ops_log_retention_state set last_skip_reason = 'jrd:' || reason, last_skip_at = now(),
      skip_count = skip_count + 1, updated_at = now() where id = 1;
    return jsonb_build_object('result', 'skipped', 'reason', reason);
  end if;

  t0 := clock_timestamp();
  begin
    select max(runid) into v_max from cron.job_run_details;                -- PK backward, 1 row
    v_ceiling := coalesce(v_max, 0) - c_keep_recent;                         -- never touch newest 20k
    v_lo := coalesce(s.jrd_cursor,
                     (select runid from cron.job_run_details order by runid limit 1)); -- PK, 1 row
    if v_lo is not null and v_lo < v_ceiling then
      -- gap-robust: jump to first existing runid at/after cursor (PK, 1 row)
      v_lo := (select runid from cron.job_run_details where runid >= v_lo order by runid limit 1);
    end if;

    if v_lo is null or v_lo >= v_ceiling then
      v_done := true;
    else
      v_hi := least(v_lo + c_window, v_ceiling);
      select count(*), count(*) filter (where start_time < cutoff and status in ('succeeded','failed')),
             min(start_time), max(start_time)
        into v_rows, v_candidates, v_win_min, v_win_max
        from cron.job_run_details where runid >= v_lo and runid < v_hi;     -- PK range, <=1000 rows
      if v_win_min is not null and v_win_min >= cutoff + interval '1 day' then
        v_done := true;
      end if;
    end if;

    if not p_dry_run and not v_done and v_candidates > 0 then
      delete from cron.job_run_details
       where runid >= v_lo and runid < v_hi
         and start_time < cutoff and status in ('succeeded','failed');
      get diagnostics v_deleted = row_count;
    end if;
  exception when others then
    ms := extract(epoch from clock_timestamp() - t0) * 1000;
    if not p_dry_run then
      update ops_log_retention_state set last_batch_ms = greatest(ms, 3001),
        paused_until = date_trunc('day', now()) + interval '1 day 2 hours', updated_at = now() where id = 1;
      insert into ops_log_retention_progress(status, detail, duration_ms) values ('jrd_error_paused', left(sqlerrm, 300), ms);
    end if;
    return jsonb_build_object('result', 'error', 'error', left(sqlerrm, 300), 'dry_run', p_dry_run);
  end;
  ms := extract(epoch from clock_timestamp() - t0) * 1000;

  if p_dry_run then
    return jsonb_build_object('result', 'dry_run', 'gate_reason_if_live', reason, 'deleted', 0,
      'cursor_lo', v_lo, 'window_hi', v_hi, 'ceiling', v_ceiling, 'max_runid', v_max,
      'rows_in_window', v_rows, 'candidates_in_window', v_candidates,
      'window_min_start', v_win_min, 'window_max_start', v_win_max, 'cutoff', cutoff,
      'would_complete', v_done, 'duration_ms', ms);
  end if;

  if v_done then
    update ops_log_retention_state set last_batch_ms = ms, updated_at = now() where id = 1;
    insert into ops_log_retention_progress(status, duration_ms, detail) values ('jrd_finished', ms, 'cursor=' || coalesce(v_lo::text,'null'));
    return jsonb_build_object('result', 'finished', 'cursor', v_lo);
  end if;

  update ops_log_retention_state set jrd_cursor = v_hi, last_batch_ms = ms,
    paused_until = case when ms > 3000 then date_trunc('day', now()) + interval '1 day 2 hours' else paused_until end,
    updated_at = now() where id = 1;
  insert into ops_log_retention_progress(status, jrd_deleted, duration_ms, detail)
    values (case when ms > 3000 then 'jrd_slow_paused' else 'jrd_ok' end, v_deleted, ms, 'range=' || v_lo || '..' || v_hi);
  return jsonb_build_object('result', 'ok', 'deleted', v_deleted, 'range_lo', v_lo, 'range_hi', v_hi, 'duration_ms', ms);
end
$f$;

REVOKE ALL ON FUNCTION public.ops_jrd_retention_tick(boolean) FROM PUBLIC, anon, authenticated;
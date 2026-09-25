
CREATE TABLE IF NOT EXISTS public.ops_log_retention_state (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  armed boolean NOT NULL DEFAULT false,
  paused_until timestamptz,
  last_batch_ms int,
  last_skip_reason text,
  last_skip_at timestamptz,
  skip_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ops_log_retention_state TO service_role;
GRANT SELECT ON public.ops_log_retention_state TO authenticated;
ALTER TABLE public.ops_log_retention_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read retention state" ON public.ops_log_retention_state
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.ops_log_retention_state (id, armed) VALUES (1, false) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ops_log_retention_tick_v2(p_dry_run boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
declare
  s public.ops_log_retention_state%rowtype;
  reason text; act int; waiters int; conns int; maxc int;
  a int := 0; b int := 0; ms int; t0 timestamptz; h int := extract(hour from now() at time zone 'UTC');
begin
  select * into s from ops_log_retention_state where id = 1 for update;
  select count(*) into act from pg_stat_activity where state='active' and pid<>pg_backend_pid() and backend_type='client backend';
  select count(*) into waiters from pg_locks where not granted;
  select count(*) into conns from pg_stat_activity where backend_type='client backend';
  maxc := current_setting('max_connections')::int;

  if not s.armed then reason := 'not_armed';
  elsif h < 2 or h >= 8 then reason := 'outside_window';
  elsif s.paused_until is not null and now() < s.paused_until then reason := 'paused_for_night';
  elsif pg_postmaster_start_time() > now() - interval '12 hours' then reason := 'recent_restart';
  elsif act > 10 then reason := 'active_queries=' || act;
  elsif waiters > 0 then reason := 'lock_waits=' || waiters;
  elsif conns >= maxc * 0.7 then reason := 'connections=' || conns;
  elsif coalesce(s.last_batch_ms, 0) > 15000 then reason := 'previous_batch_slow=' || s.last_batch_ms;
  end if;

  if reason is not null or p_dry_run then
    update ops_log_retention_state set last_skip_reason = coalesce(reason, 'dry_run_preflight_pass'),
      last_skip_at = now(), skip_count = skip_count + 1, updated_at = now() where id = 1;
    return coalesce('skipped:' || reason, 'dry_run:preflight_pass');
  end if;

  t0 := clock_timestamp();
  begin
    perform set_config('statement_timeout', '15s', true);
    with x as (select id from cj_webhook_logs where created_at < now() - interval '90 days' and processed = true order by created_at limit 5000)
    delete from cj_webhook_logs l using x where l.id = x.id;
    get diagnostics a = row_count;
    if clock_timestamp() - t0 < interval '5 seconds' then
      with y as (select runid from cron.job_run_details where start_time < now() - interval '30 days' and status in ('succeeded','failed') limit 1000)
      delete from cron.job_run_details d using y where d.runid = y.runid;
      get diagnostics b = row_count;
    end if;
  exception when others then
    ms := extract(epoch from clock_timestamp() - t0) * 1000;
    update ops_log_retention_state set last_batch_ms = greatest(ms, 15001),
      paused_until = date_trunc('day', now()) + interval '1 day 2 hours', updated_at = now() where id = 1;
    insert into ops_log_retention_progress(status, detail, duration_ms) values ('error_paused_night', left(sqlerrm, 300), ms);
    return 'error_paused';
  end;
  ms := extract(epoch from clock_timestamp() - t0) * 1000;
  if ms > 15000 then
    update ops_log_retention_state set last_batch_ms = ms,
      paused_until = date_trunc('day', now()) + interval '1 day 2 hours', updated_at = now() where id = 1;
    insert into ops_log_retention_progress(status, cj_deleted, jrd_deleted, duration_ms, detail) values ('slow_paused_night', a, b, ms, 'v2');
    return 'slow_paused';
  end if;
  update ops_log_retention_state set last_batch_ms = ms, updated_at = now() where id = 1;
  if a = 0 and b = 0 then
    insert into ops_log_retention_progress(status, detail) values ('finished', 'v2 drained; job unscheduled');
    perform cron.unschedule('ops-log-retention-batch');
    return 'finished';
  end if;
  insert into ops_log_retention_progress(status, cj_deleted, jrd_deleted, duration_ms, detail) values ('ok', a, b, ms, 'v2');
  return a || '/' || b;
end $f$;
REVOKE ALL ON FUNCTION public.ops_log_retention_tick_v2(boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ops_log_retention_tick()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ select public.ops_log_retention_tick_v2(false) $$;
REVOKE ALL ON FUNCTION public.ops_log_retention_tick() FROM PUBLIC, anon, authenticated;

SELECT cron.alter_job(358, schedule := '*/5 2-7 * * *', command := 'select public.ops_log_retention_tick_v2(false)', active := false);

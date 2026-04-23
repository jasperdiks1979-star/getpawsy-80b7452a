-- Render-trace timeout alert configuration
create table if not exists public.render_trace_alerts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope text not null check (scope in ('overall', 'slug')),
  -- For scope='slug', optional ILIKE pattern to limit which slugs match.
  -- When null with scope='slug', the rule fires on ANY individual slug exceeding the threshold.
  slug_pattern text,
  -- Timeout rate as fraction (0..1). Fires when timeout/shell exceeds this.
  threshold_rate numeric not null check (threshold_rate >= 0 and threshold_rate <= 1),
  -- Minimum 'shell' pings required in window before evaluating (avoids tiny-sample false positives).
  min_sample integer not null default 20 check (min_sample >= 1),
  -- Window to evaluate over (days, 1..30).
  window_days integer not null default 1 check (window_days between 1 and 30),
  enabled boolean not null default true,
  -- Cooldown between repeat firings of the same alert (minutes).
  cooldown_minutes integer not null default 60 check (cooldown_minutes >= 0),
  last_triggered_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_render_trace_alerts_enabled
  on public.render_trace_alerts (enabled) where enabled = true;

alter table public.render_trace_alerts enable row level security;

create policy "admins manage render_trace_alerts"
  on public.render_trace_alerts
  for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create trigger trg_render_trace_alerts_updated_at
  before update on public.render_trace_alerts
  for each row execute function public.update_updated_at_column();

-- Event log of alert firings (for history + cooldown tracking).
create table if not exists public.render_trace_alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.render_trace_alerts(id) on delete cascade,
  scope text not null,
  slug text, -- null for overall
  observed_rate numeric not null,
  observed_timeouts integer not null,
  observed_shell integer not null,
  threshold_rate numeric not null,
  window_days integer not null,
  fired_at timestamptz not null default now()
);

create index if not exists idx_render_trace_alert_events_alert_fired
  on public.render_trace_alert_events (alert_id, fired_at desc);

alter table public.render_trace_alert_events enable row level security;

create policy "admins read render_trace_alert_events"
  on public.render_trace_alert_events
  for select
  using (public.has_role(auth.uid(), 'admin'));

create policy "admins insert render_trace_alert_events"
  on public.render_trace_alert_events
  for insert
  with check (public.has_role(auth.uid(), 'admin'));

-- Evaluate all enabled rules and return currently-firing alerts.
-- Also records firing events (respecting cooldown) and updates last_triggered_at.
create or replace function public.evaluate_render_trace_alerts(p_record boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rule record;
  v_now timestamptz := now();
  v_from timestamptz;
  v_state_re text := 'pdp-render-trace/([a-zA-Z0-9_-]+)';
  v_overall record;
  v_slug record;
  v_firings jsonb := '[]'::jsonb;
  v_should_record boolean;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  for v_rule in
    select * from public.render_trace_alerts where enabled = true
  loop
    v_from := v_now - make_interval(days => v_rule.window_days);

    if v_rule.scope = 'overall' then
      with raw as (
        select lower(substring(cv.user_agent from v_state_re)) as state
        from public.crawler_visits cv
        where cv.user_agent ilike '%pdp-render-trace%'
          and cv.created_at >= v_from
        limit 200000
      )
      select
        coalesce(sum((state = 'shell')::int), 0)::int   as shell,
        coalesce(sum((state = 'timeout')::int), 0)::int as timeout
      into v_overall
      from raw
      where state in ('shell', 'rendered', 'timeout');

      if v_overall.shell >= v_rule.min_sample
         and (v_overall.timeout::numeric / nullif(v_overall.shell, 0)) > v_rule.threshold_rate then

        v_should_record := p_record
          and (v_rule.last_triggered_at is null
               or v_rule.last_triggered_at < v_now - make_interval(mins => v_rule.cooldown_minutes));

        if v_should_record then
          insert into public.render_trace_alert_events (
            alert_id, scope, slug, observed_rate, observed_timeouts,
            observed_shell, threshold_rate, window_days
          ) values (
            v_rule.id, 'overall', null,
            v_overall.timeout::numeric / v_overall.shell,
            v_overall.timeout, v_overall.shell,
            v_rule.threshold_rate, v_rule.window_days
          );
          update public.render_trace_alerts
            set last_triggered_at = v_now
            where id = v_rule.id;
        end if;

        v_firings := v_firings || jsonb_build_object(
          'alert_id', v_rule.id,
          'name', v_rule.name,
          'scope', 'overall',
          'slug', null,
          'observed_rate', v_overall.timeout::numeric / v_overall.shell,
          'observed_timeouts', v_overall.timeout,
          'observed_shell', v_overall.shell,
          'threshold_rate', v_rule.threshold_rate,
          'window_days', v_rule.window_days,
          'recorded', v_should_record
        );
      end if;

    else
      -- scope = 'slug' — evaluate per-slug, optionally filtered by ILIKE pattern.
      for v_slug in
        with raw as (
          select
            cv.user_agent,
            cv.page_url,
            lower(substring(cv.user_agent from v_state_re)) as state
          from public.crawler_visits cv
          where cv.user_agent ilike '%pdp-render-trace%'
            and cv.created_at >= v_from
          limit 200000
        ),
        classified as (
          select
            state,
            case
              when page_url is null or page_url = '' then null
              else nullif(
                regexp_replace(
                  split_part(
                    regexp_replace(page_url, '^https?://[^/]+', ''),
                    '?', 1
                  ),
                  '^.*/([^/]+)/?$',
                  '\1'
                ),
                ''
              )
            end as slug
          from raw
          where state in ('shell', 'rendered', 'timeout')
        )
        select
          slug,
          sum((state = 'shell')::int)::int   as shell,
          sum((state = 'timeout')::int)::int as timeout
        from classified
        where slug is not null
          and (v_rule.slug_pattern is null or slug ilike v_rule.slug_pattern)
        group by slug
        having sum((state = 'shell')::int) >= v_rule.min_sample
           and (sum((state = 'timeout')::int)::numeric
                / nullif(sum((state = 'shell')::int), 0)) > v_rule.threshold_rate
        order by (sum((state = 'timeout')::int)::numeric
                  / nullif(sum((state = 'shell')::int), 0)) desc
        limit 50
      loop
        v_should_record := p_record
          and (v_rule.last_triggered_at is null
               or v_rule.last_triggered_at < v_now - make_interval(mins => v_rule.cooldown_minutes));

        if v_should_record then
          insert into public.render_trace_alert_events (
            alert_id, scope, slug, observed_rate, observed_timeouts,
            observed_shell, threshold_rate, window_days
          ) values (
            v_rule.id, 'slug', v_slug.slug,
            v_slug.timeout::numeric / v_slug.shell,
            v_slug.timeout, v_slug.shell,
            v_rule.threshold_rate, v_rule.window_days
          );
        end if;

        v_firings := v_firings || jsonb_build_object(
          'alert_id', v_rule.id,
          'name', v_rule.name,
          'scope', 'slug',
          'slug', v_slug.slug,
          'observed_rate', v_slug.timeout::numeric / v_slug.shell,
          'observed_timeouts', v_slug.timeout,
          'observed_shell', v_slug.shell,
          'threshold_rate', v_rule.threshold_rate,
          'window_days', v_rule.window_days,
          'recorded', v_should_record
        );
      end loop;

      -- Update last_triggered_at once if any slug fired and we're recording.
      if p_record
         and jsonb_array_length(v_firings) > 0
         and (v_rule.last_triggered_at is null
              or v_rule.last_triggered_at < v_now - make_interval(mins => v_rule.cooldown_minutes))
      then
        update public.render_trace_alerts
          set last_triggered_at = v_now
          where id = v_rule.id;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'evaluated_at', v_now,
    'firings', v_firings
  );
end;
$$;
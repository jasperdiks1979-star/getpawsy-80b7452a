-- Per-slug hourly timeline RPC for the Render-Trace dashboard drill-down view.
-- Mirrors the classification logic in get_render_trace_stats but bucketed by
-- hour for a single slug. Returns totals + chronological hourly buckets so
-- the detail page can render a sparkline / bar chart and a table without
-- pulling raw rows.
create or replace function public.get_render_trace_slug_timeline(
  p_slug text,
  p_window_days integer default 7
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz;
  v_window_days integer;
  v_slug text;
  v_totals jsonb;
  v_per_hour jsonb;
  v_per_day jsonb;
  v_first timestamptz;
  v_last timestamptz;
  v_state_re text := 'pdp-render-trace/([a-zA-Z0-9_-]+)';
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_window_days := greatest(1, least(coalesce(p_window_days, 7), 90));
  v_slug := nullif(trim(coalesce(p_slug, '')), '');
  if v_slug is null then
    raise exception 'p_slug is required' using errcode = '22023';
  end if;
  v_from := date_trunc('day', now()) - make_interval(days => v_window_days - 1);

  with raw as (
    select
      cv.page_url,
      cv.user_agent,
      cv.created_at,
      lower(substring(cv.user_agent from v_state_re)) as raw_tag
    from public.crawler_visits cv
    where cv.user_agent ilike '%pdp-render-trace%'
      and cv.created_at >= v_from
    limit 200000
  ),
  classified as (
    select
      r.created_at,
      r.raw_tag as state,
      case
        when r.page_url is null or r.page_url = '' then null
        else nullif(
          regexp_replace(
            split_part(
              regexp_replace(r.page_url, '^https?://[^/]+', ''),
              '?', 1
            ),
            '^.*/([^/]+)/?$',
            '\1'
          ),
          ''
        )
      end as slug
    from raw r
    where r.raw_tag in ('shell', 'rendered', 'timeout')
  ),
  matched as (
    select created_at, state
    from classified
    where slug = v_slug
  )
  select
    jsonb_build_object(
      'shell',    coalesce(sum((state = 'shell')::int), 0),
      'rendered', coalesce(sum((state = 'rendered')::int), 0),
      'timeout',  coalesce(sum((state = 'timeout')::int), 0)
    ),
    min(created_at),
    max(created_at)
  into v_totals, v_first, v_last
  from matched;

  select coalesce(jsonb_agg(h order by h.hour), '[]'::jsonb)
  into v_per_hour
  from (
    select
      to_char(date_trunc('hour', created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:00:00"Z"') as hour,
      sum((state = 'shell')::int)    as shell,
      sum((state = 'rendered')::int) as rendered,
      sum((state = 'timeout')::int)  as timeout
    from (
      select cv.created_at, lower(substring(cv.user_agent from v_state_re)) as state
      from public.crawler_visits cv
      where cv.user_agent ilike '%pdp-render-trace%'
        and cv.created_at >= v_from
        and lower(substring(cv.user_agent from v_state_re)) in ('shell', 'rendered', 'timeout')
        and (
          case
            when cv.page_url is null or cv.page_url = '' then null
            else nullif(
              regexp_replace(
                split_part(
                  regexp_replace(cv.page_url, '^https?://[^/]+', ''),
                  '?', 1
                ),
                '^.*/([^/]+)/?$',
                '\1'
              ),
              ''
            )
          end
        ) = v_slug
    ) m
    group by 1
  ) h;

  select coalesce(jsonb_agg(d order by d.date), '[]'::jsonb)
  into v_per_day
  from (
    select
      to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date,
      sum((state = 'shell')::int)    as shell,
      sum((state = 'rendered')::int) as rendered,
      sum((state = 'timeout')::int)  as timeout
    from (
      select cv.created_at, lower(substring(cv.user_agent from v_state_re)) as state
      from public.crawler_visits cv
      where cv.user_agent ilike '%pdp-render-trace%'
        and cv.created_at >= v_from
        and lower(substring(cv.user_agent from v_state_re)) in ('shell', 'rendered', 'timeout')
        and (
          case
            when cv.page_url is null or cv.page_url = '' then null
            else nullif(
              regexp_replace(
                split_part(
                  regexp_replace(cv.page_url, '^https?://[^/]+', ''),
                  '?', 1
                ),
                '^.*/([^/]+)/?$',
                '\1'
              ),
              ''
            )
          end
        ) = v_slug
    ) m
    group by 1
  ) d;

  return jsonb_build_object(
    'slug',         v_slug,
    'window_days',  v_window_days,
    'from',         v_from,
    'totals',       coalesce(v_totals, jsonb_build_object('shell', 0, 'rendered', 0, 'timeout', 0)),
    'first_seen',   v_first,
    'last_seen',    v_last,
    'per_hour',     v_per_hour,
    'per_day',      v_per_day
  );
end;
$$;
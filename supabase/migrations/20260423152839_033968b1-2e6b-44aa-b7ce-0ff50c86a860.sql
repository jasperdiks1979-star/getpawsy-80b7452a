-- Server-side aggregation for the PDP render-trace dashboard.
-- Returns totals, per-day counts, malformed-row stats, and a *paginated*
-- slice of per-slug stats so the client never has to pull 10k raw rows.
create or replace function public.get_render_trace_stats(
  p_window_days integer default 7,
  p_search text default null,
  p_slug_limit integer default 100,
  p_slug_offset integer default 0,
  p_malformed_limit integer default 10
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
  v_slug_limit integer;
  v_slug_offset integer;
  v_malformed_limit integer;
  v_search text;
  v_totals jsonb;
  v_per_day jsonb;
  v_malformed_counts jsonb;
  v_malformed_samples jsonb;
  v_slug_total integer;
  v_slugs jsonb;
  v_state_re text := 'pdp-render-trace/([a-zA-Z0-9_-]+)';
begin
  -- Admin-only. Anyone else gets nothing — the dashboard route is already
  -- gated, this is defense in depth.
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Clamp inputs to safe ranges.
  v_window_days := greatest(1, least(coalesce(p_window_days, 7), 90));
  v_slug_limit := greatest(1, least(coalesce(p_slug_limit, 100), 500));
  v_slug_offset := greatest(0, coalesce(p_slug_offset, 0));
  v_malformed_limit := greatest(0, least(coalesce(p_malformed_limit, 10), 50));
  v_search := nullif(trim(coalesce(p_search, '')), '');
  v_from := date_trunc('day', now()) - make_interval(days => v_window_days - 1);

  -- One pass over the trace rows in the window, classified into states.
  -- We compute slug + state once per row in a CTE and reuse it for every
  -- aggregate below.
  with raw as (
    select
      cv.page_url,
      cv.user_agent,
      cv.created_at,
      lower(substring(cv.user_agent from v_state_re)) as raw_tag
    from public.crawler_visits cv
    where cv.user_agent ilike '%pdp-render-trace%'
      and cv.created_at >= v_from
    limit 100000  -- hard ceiling so a runaway window can't OOM the function
  ),
  classified as (
    select
      r.*,
      case
        when r.raw_tag in ('shell', 'rendered', 'timeout') then r.raw_tag
        else null
      end as state,
      -- Best-effort slug extraction matching the client logic.
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
  ),
  valid as (
    select * from classified where state is not null
  )

  -- Totals + per-day + malformed counts + paginated slugs all derive from
  -- the same CTE. We materialize each piece into a local jsonb and assemble
  -- the envelope at the end.
  select
    jsonb_build_object(
      'shell',    coalesce(sum((state = 'shell')::int), 0),
      'rendered', coalesce(sum((state = 'rendered')::int), 0),
      'timeout',  coalesce(sum((state = 'timeout')::int), 0)
    )
  into v_totals
  from valid;

  select coalesce(jsonb_agg(d order by d.date), '[]'::jsonb)
  into v_per_day
  from (
    select
      to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date,
      sum((state = 'shell')::int)    as shell,
      sum((state = 'rendered')::int) as rendered,
      sum((state = 'timeout')::int)  as timeout
    from valid
    group by 1
  ) d;

  -- Malformed = present in raw but not classified into a known state, OR
  -- the URL didn't yield a slug. We surface counts by reason and a small
  -- recent sample for the UI.
  with malformed as (
    select
      page_url,
      user_agent,
      created_at,
      raw_tag,
      case
        when raw_tag is null then 'missing_state_tag'
        when raw_tag not in ('shell', 'rendered', 'timeout') then 'unknown_state_tag'
        when page_url is null or page_url = '' then 'unparseable_page_url'
        else 'empty_slug_path'
      end as reason
    from classified
    where state is null
       or (state is not null and (page_url is null or page_url = ''))
  )
  select
    coalesce(jsonb_object_agg(reason, cnt), '{}'::jsonb)
  into v_malformed_counts
  from (
    select reason, count(*)::int as cnt
    from malformed
    group by reason
  ) m;

  select coalesce(jsonb_agg(s order by s.created_at desc), '[]'::jsonb)
  into v_malformed_samples
  from (
    select
      reason,
      page_url,
      user_agent,
      created_at,
      raw_tag
    from (
      select
        m.*,
        row_number() over (order by created_at desc) as rn
      from (
        select
          page_url,
          user_agent,
          created_at,
          raw_tag,
          case
            when raw_tag is null then 'missing_state_tag'
            when raw_tag not in ('shell', 'rendered', 'timeout') then 'unknown_state_tag'
            when page_url is null or page_url = '' then 'unparseable_page_url'
            else 'empty_slug_path'
          end as reason
        from classified
        where state is null
           or (state is not null and (page_url is null or page_url = ''))
      ) m
    ) m
    where rn <= v_malformed_limit
  ) s;

  -- Per-slug aggregation, ordered by timeouts desc then volume desc so the
  -- highest-signal regressions land on page 1 even when the caller paginates.
  with slug_stats as (
    select
      slug,
      sum((state = 'shell')::int)    as shell,
      sum((state = 'rendered')::int) as rendered,
      sum((state = 'timeout')::int)  as timeout,
      count(*)::int                  as total
    from valid
    where slug is not null
      and (v_search is null or slug ilike '%' || v_search || '%')
    group by slug
  ),
  ranked as (
    select
      slug,
      shell,
      rendered,
      timeout,
      total,
      least(1.0, rendered::numeric / nullif(greatest(shell, total), 0)) as render_rate,
      least(1.0, timeout::numeric  / nullif(greatest(shell, total), 0)) as timeout_rate
    from slug_stats
  )
  select count(*)::int into v_slug_total from ranked;

  select coalesce(jsonb_agg(r order by r.timeout desc, r.total desc), '[]'::jsonb)
  into v_slugs
  from (
    select
      slug,
      shell,
      rendered,
      timeout,
      total,
      coalesce(render_rate, 0)  as render_rate,
      coalesce(timeout_rate, 0) as timeout_rate
    from (
      select
        rk.*,
        row_number() over (order by timeout desc, total desc) as rn
      from (
        select
          slug,
          sum((state = 'shell')::int)    as shell,
          sum((state = 'rendered')::int) as rendered,
          sum((state = 'timeout')::int)  as timeout,
          count(*)::int                  as total,
          least(1.0, sum((state = 'rendered')::int)::numeric
                     / nullif(greatest(sum((state = 'shell')::int), count(*)::int), 0)) as render_rate,
          least(1.0, sum((state = 'timeout')::int)::numeric
                     / nullif(greatest(sum((state = 'shell')::int), count(*)::int), 0)) as timeout_rate
        from valid
        where slug is not null
          and (v_search is null or slug ilike '%' || v_search || '%')
        group by slug
      ) rk
    ) rk
    where rn > v_slug_offset and rn <= v_slug_offset + v_slug_limit
  ) r;

  return jsonb_build_object(
    'window_days',  v_window_days,
    'from',         v_from,
    'totals',       v_totals,
    'per_day',      v_per_day,
    'slug_total',   v_slug_total,
    'slug_limit',   v_slug_limit,
    'slug_offset',  v_slug_offset,
    'slugs',        v_slugs,
    'malformed_counts',  v_malformed_counts,
    'malformed_samples', v_malformed_samples
  );
end;
$$;

-- Lock down EXECUTE: only authenticated users can call it; the function
-- itself enforces the admin check on `auth.uid()`.
revoke all on function public.get_render_trace_stats(integer, text, integer, integer, integer) from public, anon;
grant execute on function public.get_render_trace_stats(integer, text, integer, integer, integer) to authenticated;

-- Index to keep the window scan fast as crawler_visits grows.
create index if not exists idx_crawler_visits_render_trace_recent
  on public.crawler_visits (created_at desc)
  where user_agent ilike '%pdp-render-trace%';
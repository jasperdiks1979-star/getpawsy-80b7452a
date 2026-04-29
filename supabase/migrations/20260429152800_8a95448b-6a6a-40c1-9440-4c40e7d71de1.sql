create or replace function public.get_tiktok_excluded_sessions(
  p_window_days integer default 30,
  p_limit integer default 200,
  p_offset integer default 0,
  p_rule text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_window_days integer;
  v_from timestamptz;
  v_limit integer;
  v_offset integer;
  v_rule text;
  v_total integer;
  v_rows jsonb;
  v_summary jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_window_days := greatest(1, least(coalesce(p_window_days, 30), 365));
  v_limit := greatest(1, least(coalesce(p_limit, 200), 1000));
  v_offset := greatest(0, coalesce(p_offset, 0));
  v_rule := nullif(trim(coalesce(p_rule, '')), '');
  v_from := now() - make_interval(days => v_window_days);

  -- Aggregate per session, only TikTok-tagged sessions, classify which exclusion
  -- rules fired. A session is "excluded" if any rule fired.
  with tiktok_sessions as (
    select
      va.session_id,
      min(va.created_at) as first_seen,
      max(va.created_at) as last_seen,
      count(*)::int as event_count,
      max(coalesce(nullif(va.utm_campaign, ''), '(none)')) as hook,
      max(coalesce(nullif(va.utm_content, ''), '')) as utm_content,
      max(coalesce(nullif(va.country, ''), '')) as country,
      max(coalesce(nullif(va.browser, ''), '')) as browser,
      max(coalesce(va.screen_width, 0)) as screen_width,
      bool_or(coalesce(va.is_internal, false)) as has_internal,
      bool_or(lower(coalesce(va.country, '')) in ('netherlands','nl')) as has_nl,
      bool_or(coalesce(va.page_path, '') like '/admin%') as has_admin,
      bool_or(coalesce(va.browser, '') = 'unknown' and coalesce(va.screen_width, 0) = 0) as has_bot
    from public.visitor_activity va
    where va.created_at >= v_from
      and lower(coalesce(va.utm_source, '')) = 'tiktok'
    group by va.session_id
  ),
  excluded as (
    select
      session_id, first_seen, last_seen, event_count, hook, utm_content,
      country, browser, screen_width,
      has_internal, has_nl, has_admin, has_bot,
      array_remove(array[
        case when has_internal then 'is_internal' end,
        case when has_nl       then 'country=NL'  end,
        case when has_admin    then 'admin_route' end,
        case when has_bot      then 'bot_heuristic' end
      ], null) as rules
    from tiktok_sessions
    where has_internal or has_nl or has_admin or has_bot
  ),
  filtered as (
    select * from excluded
    where v_rule is null or v_rule = any(rules)
  )
  select count(*)::int into v_total from filtered;

  with tiktok_sessions as (
    select
      va.session_id,
      min(va.created_at) as first_seen,
      max(va.created_at) as last_seen,
      count(*)::int as event_count,
      max(coalesce(nullif(va.utm_campaign, ''), '(none)')) as hook,
      max(coalesce(nullif(va.utm_content, ''), '')) as utm_content,
      max(coalesce(nullif(va.country, ''), '')) as country,
      max(coalesce(nullif(va.browser, ''), '')) as browser,
      max(coalesce(va.screen_width, 0)) as screen_width,
      bool_or(coalesce(va.is_internal, false)) as has_internal,
      bool_or(lower(coalesce(va.country, '')) in ('netherlands','nl')) as has_nl,
      bool_or(coalesce(va.page_path, '') like '/admin%') as has_admin,
      bool_or(coalesce(va.browser, '') = 'unknown' and coalesce(va.screen_width, 0) = 0) as has_bot
    from public.visitor_activity va
    where va.created_at >= v_from
      and lower(coalesce(va.utm_source, '')) = 'tiktok'
    group by va.session_id
  ),
  excluded as (
    select
      session_id, first_seen, last_seen, event_count, hook, utm_content,
      country, browser, screen_width,
      array_remove(array[
        case when has_internal then 'is_internal' end,
        case when has_nl       then 'country=NL'  end,
        case when has_admin    then 'admin_route' end,
        case when has_bot      then 'bot_heuristic' end
      ], null) as rules
    from tiktok_sessions
    where has_internal or has_nl or has_admin or has_bot
  ),
  filtered as (
    select * from excluded
    where v_rule is null or v_rule = any(rules)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'session_id', session_id,
      'first_seen', first_seen,
      'last_seen', last_seen,
      'event_count', event_count,
      'hook', hook,
      'utm_content', utm_content,
      'country', country,
      'browser', browser,
      'screen_width', screen_width,
      'rules', to_jsonb(rules)
    )
    order by last_seen desc
  ), '[]'::jsonb)
  into v_rows
  from (
    select * from filtered
    order by last_seen desc
    limit v_limit offset v_offset
  ) f;

  -- Per-rule summary across the whole excluded set (ignores rule filter so the
  -- dashboard can show "X sessions hit rule Y").
  with tiktok_sessions as (
    select
      va.session_id,
      bool_or(coalesce(va.is_internal, false)) as has_internal,
      bool_or(lower(coalesce(va.country, '')) in ('netherlands','nl')) as has_nl,
      bool_or(coalesce(va.page_path, '') like '/admin%') as has_admin,
      bool_or(coalesce(va.browser, '') = 'unknown' and coalesce(va.screen_width, 0) = 0) as has_bot
    from public.visitor_activity va
    where va.created_at >= v_from
      and lower(coalesce(va.utm_source, '')) = 'tiktok'
    group by va.session_id
  )
  select jsonb_build_object(
    'is_internal',   sum(has_internal::int)::int,
    'country_nl',    sum(has_nl::int)::int,
    'admin_route',   sum(has_admin::int)::int,
    'bot_heuristic', sum(has_bot::int)::int,
    'any_excluded',  sum((has_internal or has_nl or has_admin or has_bot)::int)::int,
    'total_sessions', count(*)::int
  )
  into v_summary
  from tiktok_sessions;

  return jsonb_build_object(
    'window_days', v_window_days,
    'from', v_from,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'rule_filter', v_rule,
    'summary', v_summary,
    'rows', v_rows
  );
end;
$$;
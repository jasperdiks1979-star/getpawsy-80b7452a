-- Session-scoped TikTok filter decision log RPC.
-- Returns a per-event timeline showing exactly which filter rules each event
-- triggered (with timestamps), plus a session-level verdict, so admins can
-- debug WHY datapoints are missing from TikTok performance reports.

create or replace function public.get_tiktok_session_decision_log(
  p_window_days integer default 7,
  p_session_id text default null,
  p_only_excluded boolean default false,
  p_limit integer default 100
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
  v_sessions jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_window_days := greatest(1, least(coalesce(p_window_days, 7), 90));
  v_from := now() - make_interval(days => v_window_days);
  v_limit := greatest(1, least(coalesce(p_limit, 100), 500));

  with tiktok_sessions as (
    select distinct va.session_id
    from public.visitor_activity va
    where va.created_at >= v_from
      and lower(coalesce(va.utm_source, '')) = 'tiktok'
      and (p_session_id is null or va.session_id = p_session_id)
  ),
  events as (
    select
      va.session_id,
      va.id as event_id,
      va.created_at,
      va.activity_type,
      va.page_path,
      va.country,
      va.browser,
      va.device_type,
      va.screen_width,
      va.screen_height,
      va.is_internal,
      va.utm_campaign,
      va.utm_content,
      va.utm_medium,
      -- per-event rule evaluations
      coalesce(va.is_internal, false) as r_internal,
      (lower(coalesce(va.country, '')) in ('netherlands','nl')) as r_country_nl,
      (coalesce(va.page_path, '') like '/admin%') as r_admin_route,
      (coalesce(va.browser, '') = 'unknown' and coalesce(va.screen_width, 0) = 0) as r_bot
    from public.visitor_activity va
    join tiktok_sessions ts on ts.session_id = va.session_id
    where va.created_at >= v_from
  ),
  per_event as (
    select
      session_id, event_id, created_at, activity_type, page_path,
      country, browser, device_type, screen_width, screen_height,
      is_internal, utm_campaign, utm_content,
      r_internal, r_country_nl, r_admin_route, r_bot,
      array_remove(array[
        case when r_internal    then 'is_internal'   end,
        case when r_country_nl  then 'country=NL'    end,
        case when r_admin_route then 'admin_route'   end,
        case when r_bot         then 'bot_heuristic' end
      ], null) as triggered_rules
    from events
  ),
  session_verdict as (
    select
      session_id,
      min(created_at) as first_seen,
      max(created_at) as last_seen,
      count(*)::int as event_count,
      bool_or(r_internal)    as has_internal,
      bool_or(r_country_nl)  as has_country_nl,
      bool_or(r_admin_route) as has_admin_route,
      bool_or(r_bot)         as has_bot,
      -- earliest timestamp per rule (when the session became "tainted")
      min(case when r_internal    then created_at end) as ts_first_internal,
      min(case when r_country_nl  then created_at end) as ts_first_country_nl,
      min(case when r_admin_route then created_at end) as ts_first_admin_route,
      min(case when r_bot         then created_at end) as ts_first_bot,
      -- most recent hook & geo for context
      (array_agg(utm_campaign order by created_at desc) filter (where utm_campaign is not null))[1] as last_hook,
      (array_agg(country      order by created_at desc) filter (where country      is not null))[1] as last_country,
      (array_agg(browser      order by created_at desc) filter (where browser      is not null))[1] as last_browser,
      (array_agg(device_type  order by created_at desc) filter (where device_type  is not null))[1] as last_device
    from per_event
    group by session_id
  ),
  filtered as (
    select *,
      (has_internal or has_country_nl or has_admin_route or has_bot) as is_excluded,
      array_remove(array[
        case when has_internal    then 'is_internal'   end,
        case when has_country_nl  then 'country=NL'    end,
        case when has_admin_route then 'admin_route'   end,
        case when has_bot         then 'bot_heuristic' end
      ], null) as session_rules
    from session_verdict
    where (p_only_excluded = false)
       or (has_internal or has_country_nl or has_admin_route or has_bot)
    order by last_seen desc
    limit v_limit
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'session_id',    f.session_id,
      'first_seen',    f.first_seen,
      'last_seen',     f.last_seen,
      'event_count',   f.event_count,
      'is_excluded',   f.is_excluded,
      'session_rules', to_jsonb(f.session_rules),
      'last_hook',     f.last_hook,
      'last_country',  f.last_country,
      'last_browser',  f.last_browser,
      'last_device',   f.last_device,
      'rule_first_triggered', jsonb_build_object(
        'is_internal',   f.ts_first_internal,
        'country_nl',    f.ts_first_country_nl,
        'admin_route',   f.ts_first_admin_route,
        'bot_heuristic', f.ts_first_bot
      ),
      'timeline', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'ts',              pe.created_at,
            'event_id',        pe.event_id,
            'activity_type',   pe.activity_type,
            'page_path',       pe.page_path,
            'country',         pe.country,
            'browser',         pe.browser,
            'device_type',     pe.device_type,
            'screen',          jsonb_build_object('w', pe.screen_width, 'h', pe.screen_height),
            'is_internal',     pe.is_internal,
            'utm_campaign',    pe.utm_campaign,
            'utm_content',     pe.utm_content,
            'triggered_rules', to_jsonb(pe.triggered_rules)
          )
          order by pe.created_at
        ), '[]'::jsonb)
        from per_event pe
        where pe.session_id = f.session_id
      )
    )
    order by f.last_seen desc
  ), '[]'::jsonb)
  into v_sessions
  from filtered f;

  return jsonb_build_object(
    'window_days', v_window_days,
    'generated_at', now(),
    'session_count', coalesce(jsonb_array_length(v_sessions), 0),
    'sessions', v_sessions
  );
end;
$$;

revoke all on function public.get_tiktok_session_decision_log(integer, text, boolean, integer) from public, anon, authenticated;
grant execute on function public.get_tiktok_session_decision_log(integer, text, boolean, integer) to authenticated;
-- Stricter TikTok bot heuristic: combine 3 signals (browser unknown,
-- 0x0 screen, no cart/checkout UI events) and propagate to every report.

------------------------------------------------------------------------
-- 1) Hook performance (with stricter bot rule)
------------------------------------------------------------------------
create or replace function public.get_tiktok_hook_performance(
  p_window_days integer default 30,
  p_campaign_pattern text default null,
  p_include_excluded boolean default false
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_window_days integer;
  v_from timestamptz;
  v_pattern text;
  v_include_excluded boolean;
  v_per_hook jsonb;
  v_totals jsonb;
  v_per_day jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_window_days := greatest(1, least(coalesce(p_window_days, 30), 365));
  v_from := now() - make_interval(days => v_window_days);
  v_pattern := nullif(trim(coalesce(p_campaign_pattern, '')), '');
  v_include_excluded := coalesce(p_include_excluded, false);

  with clean_sessions as (
    select va.session_id
    from public.visitor_activity va
    where va.created_at >= v_from
    group by va.session_id
    having
      v_include_excluded = true
      or (
            bool_or(coalesce(va.is_internal, false)) = false
        and bool_or(lower(coalesce(va.country, '')) in ('netherlands','nl')) = false
        and bool_or(coalesce(va.page_path, '') like '/admin%') = false
        -- Stricter bot rule: unknown browser AND 0x0 screen AND no UI events
        and not (
              bool_or(coalesce(va.browser, '') = 'unknown')
          and bool_or(coalesce(va.screen_width, 0) = 0 and coalesce(va.screen_height, 0) = 0)
          and bool_or(va.activity_type in ('cart','checkout')) = false
        )
      )
  ),
  base as (
    select
      coalesce(nullif(va.utm_campaign, ''), '(none)') as hook,
      va.session_id, va.activity_type, va.page_path,
      va.order_id, va.order_value, va.created_at
    from public.visitor_activity va
    join clean_sessions cs on cs.session_id = va.session_id
    where va.created_at >= v_from
      and lower(coalesce(va.utm_source, '')) = 'tiktok'
      and (v_pattern is null or va.utm_campaign ilike v_pattern)
  ),
  per_hook as (
    select
      hook,
      count(distinct session_id)::int as sessions,
      sum((page_path = '/go' or page_path like '/go?%')::int)::int as go_views,
      sum((page_path like '/product/%' or page_path like '/products/%')::int)::int as pdp_views,
      count(distinct case when page_path like '/product/%' or page_path like '/products/%' then session_id end)::int as pdp_sessions,
      sum((activity_type = 'cart')::int)::int as cart_events,
      count(distinct case when activity_type = 'cart' then session_id end)::int as cart_sessions,
      sum((activity_type = 'checkout')::int)::int as checkout_events,
      count(distinct case when activity_type = 'checkout' then session_id end)::int as checkout_sessions,
      count(distinct case when order_id is not null then order_id end)::int as purchases,
      coalesce(sum(case when order_id is not null then order_value else 0 end), 0)::numeric as revenue
    from base
    group by hook
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'hook', hook, 'sessions', sessions, 'go_views', go_views,
      'pdp_views', pdp_views, 'pdp_sessions', pdp_sessions,
      'cart_events', cart_events, 'cart_sessions', cart_sessions,
      'checkout_events', checkout_events, 'checkout_sessions', checkout_sessions,
      'purchases', purchases, 'revenue', revenue,
      'pdp_ctr', case when sessions > 0 then round((pdp_sessions::numeric / sessions) * 100, 2) else 0 end,
      'cart_rate', case when pdp_sessions > 0 then round((cart_sessions::numeric / pdp_sessions) * 100, 2) else 0 end,
      'cvr', case when sessions > 0 then round((purchases::numeric / sessions) * 100, 2) else 0 end,
      'aov', case when purchases > 0 then round(revenue / purchases, 2) else 0 end
    )
    order by sessions desc, hook
  ), '[]'::jsonb)
  into v_per_hook from per_hook;

  with clean_sessions as (
    select va.session_id from public.visitor_activity va
    where va.created_at >= v_from
    group by va.session_id
    having
      v_include_excluded = true
      or (
            bool_or(coalesce(va.is_internal, false)) = false
        and bool_or(lower(coalesce(va.country, '')) in ('netherlands','nl')) = false
        and bool_or(coalesce(va.page_path, '') like '/admin%') = false
        and not (
              bool_or(coalesce(va.browser, '') = 'unknown')
          and bool_or(coalesce(va.screen_width, 0) = 0 and coalesce(va.screen_height, 0) = 0)
          and bool_or(va.activity_type in ('cart','checkout')) = false
        )
      )
  ),
  base as (
    select va.session_id, va.activity_type, va.page_path, va.order_id, va.order_value
    from public.visitor_activity va
    join clean_sessions cs on cs.session_id = va.session_id
    where va.created_at >= v_from
      and lower(coalesce(va.utm_source, '')) = 'tiktok'
      and (v_pattern is null or va.utm_campaign ilike v_pattern)
  )
  select jsonb_build_object(
    'sessions', count(distinct session_id)::int,
    'pdp_sessions', count(distinct case when page_path like '/product/%' or page_path like '/products/%' then session_id end)::int,
    'cart_sessions', count(distinct case when activity_type = 'cart' then session_id end)::int,
    'checkout_sessions', count(distinct case when activity_type = 'checkout' then session_id end)::int,
    'purchases', count(distinct case when order_id is not null then order_id end)::int,
    'revenue', coalesce(sum(case when order_id is not null then order_value else 0 end), 0)::numeric
  )
  into v_totals from base;

  with clean_sessions as (
    select va.session_id from public.visitor_activity va
    where va.created_at >= v_from
    group by va.session_id
    having
      v_include_excluded = true
      or (
            bool_or(coalesce(va.is_internal, false)) = false
        and bool_or(lower(coalesce(va.country, '')) in ('netherlands','nl')) = false
        and bool_or(coalesce(va.page_path, '') like '/admin%') = false
        and not (
              bool_or(coalesce(va.browser, '') = 'unknown')
          and bool_or(coalesce(va.screen_width, 0) = 0 and coalesce(va.screen_height, 0) = 0)
          and bool_or(va.activity_type in ('cart','checkout')) = false
        )
      )
  ),
  base as (
    select date_trunc('day', va.created_at) as day, va.session_id, va.order_id, va.order_value
    from public.visitor_activity va
    join clean_sessions cs on cs.session_id = va.session_id
    where va.created_at >= v_from
      and lower(coalesce(va.utm_source, '')) = 'tiktok'
      and (v_pattern is null or va.utm_campaign ilike v_pattern)
  )
  select coalesce(jsonb_agg(d order by d.date), '[]'::jsonb)
  into v_per_day
  from (
    select to_char(day, 'YYYY-MM-DD') as date,
      count(distinct session_id)::int as sessions,
      count(distinct case when order_id is not null then order_id end)::int as purchases,
      coalesce(sum(case when order_id is not null then order_value else 0 end), 0)::numeric as revenue
    from base group by 1
  ) d;

  return jsonb_build_object(
    'window_days', v_window_days,
    'from', v_from,
    'totals', coalesce(v_totals, jsonb_build_object('sessions',0,'pdp_sessions',0,'cart_sessions',0,'checkout_sessions',0,'purchases',0,'revenue',0)),
    'per_hook', v_per_hook,
    'per_day', v_per_day,
    'include_excluded', v_include_excluded,
    'exclusions', jsonb_build_object(
      'level', 'session',
      'applied', not v_include_excluded,
      'rules', jsonb_build_array(
        'is_internal','country=NL','page_path^/admin',
        'bot=browser:unknown+screen:0x0+no_ui_events'
      )
    )
  );
end;
$$;

------------------------------------------------------------------------
-- 2) Bio split (with stricter bot rule)
------------------------------------------------------------------------
create or replace function public.get_tiktok_bio_split(
  p_window_days integer default 30,
  p_include_excluded boolean default false
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_window_days integer;
  v_from timestamptz;
  v_include_excluded boolean;
  v_per_hook jsonb;
  v_totals jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_window_days := greatest(1, least(coalesce(p_window_days, 30), 365));
  v_from := now() - make_interval(days => v_window_days);
  v_include_excluded := coalesce(p_include_excluded, false);

  with clean_sessions as (
    select va.session_id from public.visitor_activity va
    where va.created_at >= v_from
    group by va.session_id
    having
      v_include_excluded = true
      or (
            bool_or(coalesce(va.is_internal, false)) = false
        and bool_or(lower(coalesce(va.country, '')) in ('netherlands','nl')) = false
        and bool_or(coalesce(va.page_path, '') like '/admin%') = false
        and not (
              bool_or(coalesce(va.browser, '') = 'unknown')
          and bool_or(coalesce(va.screen_width, 0) = 0 and coalesce(va.screen_height, 0) = 0)
          and bool_or(va.activity_type in ('cart','checkout')) = false
        )
      )
  ),
  base as (
    select
      lower(coalesce(nullif(va.utm_campaign, ''), '(none)')) as hook,
      va.session_id, va.activity_type, va.page_path,
      va.order_id, va.order_value, va.utm_content
    from public.visitor_activity va
    join clean_sessions cs on cs.session_id = va.session_id
    where va.created_at >= v_from
      and lower(coalesce(va.utm_source, '')) = 'tiktok'
      and lower(coalesce(va.utm_campaign, '')) in ('hook1','hook2','hook3','hook4','hook5')
  ),
  session_flags as (
    select hook, session_id,
      bool_or(lower(coalesce(utm_content, '')) = 'tt_bio_link') as is_bio,
      bool_or(page_path like '/product/%' or page_path like '/products/%') as has_pdp,
      bool_or(activity_type = 'cart') as has_cart,
      bool_or(activity_type = 'checkout') as has_checkout,
      max(case when order_id is not null then order_id end) as order_id,
      max(case when order_id is not null then order_value end) as order_value
    from base group by hook, session_id
  ),
  per_hook_split as (
    select hook, case when is_bio then 'bio' else 'other' end as bucket,
      count(*)::int as sessions,
      sum(has_pdp::int)::int as pdp_sessions,
      sum(has_cart::int)::int as cart_sessions,
      sum(has_checkout::int)::int as checkout_sessions,
      count(distinct order_id)::int as purchases,
      coalesce(sum(order_value), 0)::numeric as revenue
    from session_flags group by hook, case when is_bio then 'bio' else 'other' end
  ),
  per_hook_pivot as (
    select hook,
      coalesce(sum(case when bucket = 'bio'   then sessions          end), 0)::int as bio_sessions,
      coalesce(sum(case when bucket = 'other' then sessions          end), 0)::int as other_sessions,
      coalesce(sum(case when bucket = 'bio'   then pdp_sessions      end), 0)::int as bio_pdp,
      coalesce(sum(case when bucket = 'other' then pdp_sessions      end), 0)::int as other_pdp,
      coalesce(sum(case when bucket = 'bio'   then cart_sessions     end), 0)::int as bio_cart,
      coalesce(sum(case when bucket = 'other' then cart_sessions     end), 0)::int as other_cart,
      coalesce(sum(case when bucket = 'bio'   then checkout_sessions end), 0)::int as bio_checkout,
      coalesce(sum(case when bucket = 'other' then checkout_sessions end), 0)::int as other_checkout,
      coalesce(sum(case when bucket = 'bio'   then purchases         end), 0)::int as bio_purchases,
      coalesce(sum(case when bucket = 'other' then purchases         end), 0)::int as other_purchases,
      coalesce(sum(case when bucket = 'bio'   then revenue           end), 0)::numeric as bio_revenue,
      coalesce(sum(case when bucket = 'other' then revenue           end), 0)::numeric as other_revenue
    from per_hook_split group by hook
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'hook', hook,
      'bio_sessions', bio_sessions, 'other_sessions', other_sessions,
      'total_sessions', bio_sessions + other_sessions,
      'bio_share', case when (bio_sessions + other_sessions) > 0
                          then round((bio_sessions::numeric / (bio_sessions + other_sessions)) * 100, 2)
                          else 0 end,
      'bio_pdp', bio_pdp, 'other_pdp', other_pdp,
      'bio_cart', bio_cart, 'other_cart', other_cart,
      'bio_checkout', bio_checkout, 'other_checkout', other_checkout,
      'bio_purchases', bio_purchases, 'other_purchases', other_purchases,
      'bio_revenue', bio_revenue, 'other_revenue', other_revenue,
      'bio_cvr', case when bio_sessions   > 0 then round((bio_purchases::numeric   / bio_sessions)   * 100, 2) else 0 end,
      'other_cvr', case when other_sessions > 0 then round((other_purchases::numeric / other_sessions) * 100, 2) else 0 end,
      'bio_aov', case when bio_purchases   > 0 then round(bio_revenue   / bio_purchases,   2) else 0 end,
      'other_aov', case when other_purchases > 0 then round(other_revenue / other_purchases, 2) else 0 end
    )
    order by hook
  ), '[]'::jsonb)
  into v_per_hook from per_hook_pivot;

  with clean_sessions as (
    select va.session_id from public.visitor_activity va
    where va.created_at >= v_from
    group by va.session_id
    having
      v_include_excluded = true
      or (
            bool_or(coalesce(va.is_internal, false)) = false
        and bool_or(lower(coalesce(va.country, '')) in ('netherlands','nl')) = false
        and bool_or(coalesce(va.page_path, '') like '/admin%') = false
        and not (
              bool_or(coalesce(va.browser, '') = 'unknown')
          and bool_or(coalesce(va.screen_width, 0) = 0 and coalesce(va.screen_height, 0) = 0)
          and bool_or(va.activity_type in ('cart','checkout')) = false
        )
      )
  ),
  base as (
    select va.session_id, va.utm_content, va.order_id, va.order_value
    from public.visitor_activity va
    join clean_sessions cs on cs.session_id = va.session_id
    where va.created_at >= v_from
      and lower(coalesce(va.utm_source, '')) = 'tiktok'
      and lower(coalesce(va.utm_campaign, '')) in ('hook1','hook2','hook3','hook4','hook5')
  ),
  flagged as (
    select session_id,
      bool_or(lower(coalesce(utm_content, '')) = 'tt_bio_link') as is_bio,
      max(case when order_id is not null then order_id end) as order_id,
      max(case when order_id is not null then order_value end) as order_value
    from base group by session_id
  )
  select jsonb_build_object(
    'bio_sessions', sum(is_bio::int)::int,
    'other_sessions', sum((not is_bio)::int)::int,
    'total_sessions', count(*)::int,
    'bio_share', case when count(*) > 0
                          then round((sum(is_bio::int)::numeric / count(*)) * 100, 2)
                          else 0 end,
    'bio_purchases', count(distinct case when is_bio       and order_id is not null then order_id end)::int,
    'other_purchases', count(distinct case when not is_bio   and order_id is not null then order_id end)::int,
    'bio_revenue', coalesce(sum(case when is_bio     and order_id is not null then order_value end), 0)::numeric,
    'other_revenue', coalesce(sum(case when not is_bio and order_id is not null then order_value end), 0)::numeric
  )
  into v_totals from flagged;

  return jsonb_build_object(
    'window_days', v_window_days,
    'from', v_from,
    'totals', v_totals,
    'per_hook', v_per_hook,
    'include_excluded', v_include_excluded,
    'exclusions', jsonb_build_object(
      'level', 'session',
      'applied', not v_include_excluded,
      'rules', jsonb_build_array(
        'is_internal','country=NL','page_path^/admin',
        'bot=browser:unknown+screen:0x0+no_ui_events'
      )
    )
  );
end;
$$;

------------------------------------------------------------------------
-- 3) Excluded sessions list (stricter bot rule)
------------------------------------------------------------------------
create or replace function public.get_tiktok_excluded_sessions(
  p_window_days integer default 30,
  p_limit integer default 200,
  p_offset integer default 0,
  p_rule text default null,
  p_include_excluded boolean default false
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_window_days integer;
  v_from timestamptz;
  v_limit integer;
  v_offset integer;
  v_rule text;
  v_include_excluded boolean;
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
  v_include_excluded := coalesce(p_include_excluded, false);
  v_from := now() - make_interval(days => v_window_days);

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
      max(coalesce(va.screen_height, 0)) as screen_height,
      bool_or(coalesce(va.is_internal, false)) as has_internal,
      bool_or(lower(coalesce(va.country, '')) in ('netherlands','nl')) as has_nl,
      bool_or(coalesce(va.page_path, '') like '/admin%') as has_admin,
      bool_or(coalesce(va.browser, '') = 'unknown') as has_unknown_browser,
      bool_or(coalesce(va.screen_width, 0) = 0 and coalesce(va.screen_height, 0) = 0) as has_zero_screen,
      bool_or(va.activity_type in ('cart','checkout')) as has_ui_event
    from public.visitor_activity va
    where va.created_at >= v_from
      and lower(coalesce(va.utm_source, '')) = 'tiktok'
    group by va.session_id
  ),
  scored as (
    select
      session_id, first_seen, last_seen, event_count, hook, utm_content,
      country, browser, screen_width, screen_height,
      (has_unknown_browser and has_zero_screen and not has_ui_event) as has_bot,
      has_internal, has_nl, has_admin
    from tiktok_sessions
  ),
  classified as (
    select *,
      array_remove(array[
        case when has_internal then 'is_internal' end,
        case when has_nl       then 'country=NL'  end,
        case when has_admin    then 'admin_route' end,
        case when has_bot      then 'bot_heuristic' end
      ], null) as rules,
      (has_internal or has_nl or has_admin or has_bot) as is_excluded
    from scored
  ),
  filtered as (
    select * from classified
    where (v_include_excluded = true or is_excluded = true)
      and (v_rule is null or v_rule = any(rules))
  )
  select count(*)::int into v_total from filtered;

  select coalesce(jsonb_agg(jsonb_build_object(
    'session_id', session_id,
    'first_seen', first_seen,
    'last_seen', last_seen,
    'event_count', event_count,
    'hook', hook,
    'utm_content', utm_content,
    'country', country,
    'browser', browser,
    'screen', jsonb_build_object('w', screen_width, 'h', screen_height),
    'rules', to_jsonb(rules),
    'is_excluded', is_excluded
  ) order by last_seen desc), '[]'::jsonb)
  into v_rows
  from (
    select * from filtered order by last_seen desc
    limit v_limit offset v_offset
  ) page;

  select jsonb_build_object(
    'is_internal',   sum(case when 'is_internal'   = any(rules) then 1 else 0 end)::int,
    'country_nl',    sum(case when 'country=NL'    = any(rules) then 1 else 0 end)::int,
    'admin_route',   sum(case when 'admin_route'   = any(rules) then 1 else 0 end)::int,
    'bot_heuristic', sum(case when 'bot_heuristic' = any(rules) then 1 else 0 end)::int
  )
  into v_summary
  from classified
  where is_excluded = true;

  return jsonb_build_object(
    'window_days', v_window_days,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'include_excluded', v_include_excluded,
    'rule', v_rule,
    'sessions', v_rows,
    'summary', coalesce(v_summary, jsonb_build_object('is_internal',0,'country_nl',0,'admin_route',0,'bot_heuristic',0)),
    'rule_definition', jsonb_build_object(
      'bot_heuristic', 'browser=unknown AND screen=0x0 AND no cart/checkout events'
    )
  );
end;
$$;

------------------------------------------------------------------------
-- 4) Decision log (stricter bot rule per event AND per session)
------------------------------------------------------------------------
create or replace function public.get_tiktok_session_decision_log(
  p_window_days integer default 7,
  p_session_id text default null,
  p_only_excluded boolean default false,
  p_limit integer default 100
)
returns jsonb
language plpgsql stable security definer set search_path = public
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
      va.session_id, va.id as event_id, va.created_at, va.activity_type,
      va.page_path, va.country, va.browser, va.device_type,
      va.screen_width, va.screen_height, va.is_internal,
      va.utm_campaign, va.utm_content, va.utm_medium,
      coalesce(va.is_internal, false) as r_internal,
      (lower(coalesce(va.country, '')) in ('netherlands','nl')) as r_country_nl,
      (coalesce(va.page_path, '') like '/admin%') as r_admin_route,
      -- per-event bot signals
      (coalesce(va.browser, '') = 'unknown') as s_unknown_browser,
      (coalesce(va.screen_width, 0) = 0 and coalesce(va.screen_height, 0) = 0) as s_zero_screen
    from public.visitor_activity va
    join tiktok_sessions ts on ts.session_id = va.session_id
    where va.created_at >= v_from
  ),
  session_aggr as (
    select session_id,
      bool_or(s_unknown_browser) as has_unknown_browser,
      bool_or(s_zero_screen)     as has_zero_screen,
      bool_or(activity_type in ('cart','checkout')) as has_ui_event
    from events group by session_id
  ),
  per_event as (
    select
      e.*,
      -- Mark a single event as bot-signal-bearing only if it carries BOTH
      -- weak signals AND the session has no UI interaction at all.
      (e.s_unknown_browser and e.s_zero_screen and not sa.has_ui_event) as r_bot,
      array_remove(array[
        case when e.r_internal    then 'is_internal'   end,
        case when e.r_country_nl  then 'country=NL'    end,
        case when e.r_admin_route then 'admin_route'   end,
        case when (e.s_unknown_browser and e.s_zero_screen and not sa.has_ui_event)
                                  then 'bot_heuristic' end
      ], null) as triggered_rules
    from events e join session_aggr sa using (session_id)
  ),
  session_verdict as (
    select session_id,
      min(created_at) as first_seen,
      max(created_at) as last_seen,
      count(*)::int as event_count,
      bool_or(r_internal)    as has_internal,
      bool_or(r_country_nl)  as has_country_nl,
      bool_or(r_admin_route) as has_admin_route,
      bool_or(r_bot)         as has_bot,
      min(case when r_internal    then created_at end) as ts_first_internal,
      min(case when r_country_nl  then created_at end) as ts_first_country_nl,
      min(case when r_admin_route then created_at end) as ts_first_admin_route,
      min(case when r_bot         then created_at end) as ts_first_bot,
      (array_agg(utm_campaign order by created_at desc) filter (where utm_campaign is not null))[1] as last_hook,
      (array_agg(country      order by created_at desc) filter (where country      is not null))[1] as last_country,
      (array_agg(browser      order by created_at desc) filter (where browser      is not null))[1] as last_browser,
      (array_agg(device_type  order by created_at desc) filter (where device_type  is not null))[1] as last_device
    from per_event group by session_id
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
  into v_sessions from filtered f;

  return jsonb_build_object(
    'window_days', v_window_days,
    'generated_at', now(),
    'session_count', coalesce(jsonb_array_length(v_sessions), 0),
    'sessions', v_sessions
  );
end;
$$;

------------------------------------------------------------------------
-- 5) NEW: Bot detection impact report (old vs new rule)
------------------------------------------------------------------------
create or replace function public.get_tiktok_bot_detection_impact(
  p_window_days integer default 30
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_window_days integer;
  v_from timestamptz;
  v_result jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_window_days := greatest(1, least(coalesce(p_window_days, 30), 365));
  v_from := now() - make_interval(days => v_window_days);

  with tiktok_sessions as (
    select va.session_id,
      bool_or(coalesce(va.browser, '') = 'unknown') as has_unknown_browser,
      bool_or(coalesce(va.screen_width, 0) = 0) as has_zero_width,
      bool_or(coalesce(va.screen_width, 0) = 0 and coalesce(va.screen_height, 0) = 0) as has_zero_screen,
      bool_or(va.activity_type in ('cart','checkout')) as has_ui_event,
      -- old rule: any single event with browser=unknown AND screen_width=0
      bool_or(coalesce(va.browser, '') = 'unknown' and coalesce(va.screen_width, 0) = 0) as old_bot
    from public.visitor_activity va
    where va.created_at >= v_from
      and lower(coalesce(va.utm_source, '')) = 'tiktok'
    group by va.session_id
  ),
  scored as (
    select session_id,
      old_bot,
      (has_unknown_browser and has_zero_screen and not has_ui_event) as new_bot,
      has_ui_event
    from tiktok_sessions
  ),
  agg as (
    select
      count(*)::int as total_sessions,
      sum(old_bot::int)::int as old_bot_count,
      sum(new_bot::int)::int as new_bot_count,
      sum((old_bot and not new_bot)::int)::int as freed_sessions,
      sum((new_bot and not old_bot)::int)::int as newly_flagged,
      sum((old_bot and new_bot)::int)::int as still_bot,
      sum((old_bot and has_ui_event)::int)::int as old_bot_with_ui_event
    from scored
  )
  select jsonb_build_object(
    'window_days', v_window_days,
    'from', v_from,
    'generated_at', now(),
    'total_tiktok_sessions', total_sessions,
    'old_rule', jsonb_build_object(
      'definition', 'browser=unknown AND screen_width=0 (per event)',
      'flagged_sessions', old_bot_count,
      'flagged_share_pct', case when total_sessions > 0
        then round((old_bot_count::numeric / total_sessions) * 100, 2) else 0 end
    ),
    'new_rule', jsonb_build_object(
      'definition', 'browser=unknown AND screen=0x0 AND no cart/checkout UI events (session-level)',
      'flagged_sessions', new_bot_count,
      'flagged_share_pct', case when total_sessions > 0
        then round((new_bot_count::numeric / total_sessions) * 100, 2) else 0 end
    ),
    'delta', jsonb_build_object(
      'freed_sessions', freed_sessions,
      'newly_flagged', newly_flagged,
      'still_flagged', still_bot,
      'net_change', new_bot_count - old_bot_count,
      'old_false_positives_with_ui_event', old_bot_with_ui_event
    )
  )
  into v_result from agg;

  return v_result;
end;
$$;

revoke all on function public.get_tiktok_bot_detection_impact(integer) from public, anon, authenticated;
grant execute on function public.get_tiktok_bot_detection_impact(integer) to authenticated;
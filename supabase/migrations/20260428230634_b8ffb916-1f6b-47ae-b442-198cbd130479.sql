create or replace function public.get_tiktok_hook_performance(
  p_window_days integer default 30,
  p_campaign_pattern text default null
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
  v_pattern text;
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

  with base as (
    select
      coalesce(nullif(va.utm_campaign, ''), '(none)') as hook,
      va.session_id,
      va.activity_type,
      va.page_path,
      va.order_id,
      va.order_value,
      va.created_at
    from public.visitor_activity va
    where va.created_at >= v_from
      and lower(coalesce(va.utm_source, '')) = 'tiktok'
      and coalesce(va.is_internal, false) = false
      and (v_pattern is null or va.utm_campaign ilike v_pattern)
  ),
  per_hook as (
    select
      hook,
      count(distinct session_id)::int                                                  as sessions,
      sum((page_path = '/go' or page_path like '/go?%')::int)::int                     as go_views,
      sum((page_path like '/products/%')::int)::int                                    as pdp_views,
      count(distinct case when page_path like '/products/%' then session_id end)::int  as pdp_sessions,
      sum((activity_type = 'cart')::int)::int                                          as cart_events,
      count(distinct case when activity_type = 'cart' then session_id end)::int        as cart_sessions,
      sum((activity_type = 'checkout')::int)::int                                      as checkout_events,
      count(distinct case when activity_type = 'checkout' then session_id end)::int    as checkout_sessions,
      count(distinct case when order_id is not null then order_id end)::int            as purchases,
      coalesce(sum(case when order_id is not null then order_value else 0 end), 0)::numeric as revenue
    from base
    group by hook
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'hook',              hook,
      'sessions',          sessions,
      'go_views',          go_views,
      'pdp_views',         pdp_views,
      'pdp_sessions',      pdp_sessions,
      'cart_events',       cart_events,
      'cart_sessions',     cart_sessions,
      'checkout_events',   checkout_events,
      'checkout_sessions', checkout_sessions,
      'purchases',         purchases,
      'revenue',           revenue,
      'pdp_ctr',           case when sessions > 0 then round((pdp_sessions::numeric / sessions) * 100, 2) else 0 end,
      'cart_rate',         case when pdp_sessions > 0 then round((cart_sessions::numeric / pdp_sessions) * 100, 2) else 0 end,
      'cvr',               case when sessions > 0 then round((purchases::numeric / sessions) * 100, 2) else 0 end,
      'aov',               case when purchases > 0 then round(revenue / purchases, 2) else 0 end
    )
    order by sessions desc, hook
  ), '[]'::jsonb)
  into v_per_hook
  from per_hook;

  with base as (
    select va.session_id, va.activity_type, va.page_path, va.order_id, va.order_value
    from public.visitor_activity va
    where va.created_at >= v_from
      and lower(coalesce(va.utm_source, '')) = 'tiktok'
      and coalesce(va.is_internal, false) = false
      and (v_pattern is null or va.utm_campaign ilike v_pattern)
  )
  select jsonb_build_object(
    'sessions',          count(distinct session_id)::int,
    'pdp_sessions',      count(distinct case when page_path like '/products/%' then session_id end)::int,
    'cart_sessions',     count(distinct case when activity_type = 'cart' then session_id end)::int,
    'checkout_sessions', count(distinct case when activity_type = 'checkout' then session_id end)::int,
    'purchases',         count(distinct case when order_id is not null then order_id end)::int,
    'revenue',           coalesce(sum(case when order_id is not null then order_value else 0 end), 0)::numeric
  )
  into v_totals
  from base;

  with base as (
    select
      date_trunc('day', va.created_at) as day,
      va.session_id, va.order_id, va.order_value
    from public.visitor_activity va
    where va.created_at >= v_from
      and lower(coalesce(va.utm_source, '')) = 'tiktok'
      and coalesce(va.is_internal, false) = false
      and (v_pattern is null or va.utm_campaign ilike v_pattern)
  )
  select coalesce(jsonb_agg(d order by d.date), '[]'::jsonb)
  into v_per_day
  from (
    select
      to_char(day, 'YYYY-MM-DD') as date,
      count(distinct session_id)::int as sessions,
      count(distinct case when order_id is not null then order_id end)::int as purchases,
      coalesce(sum(case when order_id is not null then order_value else 0 end), 0)::numeric as revenue
    from base
    group by 1
  ) d;

  return jsonb_build_object(
    'window_days', v_window_days,
    'from',        v_from,
    'totals',      coalesce(v_totals, jsonb_build_object('sessions',0,'pdp_sessions',0,'cart_sessions',0,'checkout_sessions',0,'purchases',0,'revenue',0)),
    'per_hook',    v_per_hook,
    'per_day',     v_per_day
  );
end;
$$;

grant execute on function public.get_tiktok_hook_performance(integer, text) to authenticated;
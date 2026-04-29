-- Date-range variant of get_lp_funnel_report so dashboards can request a
-- custom window (start + end) instead of only "last N days".
create or replace function public.get_lp_funnel_report_range(
  p_start timestamptz,
  p_end timestamptz,
  p_campaign text default null,
  p_include_internal boolean default false
)
returns table (
  placement text,
  utm_campaign text,
  lp_view bigint,
  lp_cta_impression bigint,
  lp_cta_click bigint,
  pdp_view bigint,
  add_to_cart bigint,
  click_through_rate numeric,
  pdp_rate numeric,
  atc_rate numeric,
  end_to_end_rate numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select *
    from public.lp_funnel_events
    where created_at >= p_start
      and created_at < p_end
      and (p_include_internal or coalesce(is_internal, false) = false)
      and (p_campaign is null or utm_campaign = p_campaign)
  ),
  session_steps as (
    select
      session_id,
      coalesce(placement, lp_placement) as placement,
      utm_campaign,
      bool_or(event_name = 'lp_view') as has_view,
      bool_or(event_name = 'lp_cta_impression') as has_impression,
      bool_or(event_name = 'lp_cta_click') as has_click,
      bool_or(event_name = 'view_item' and lp_click_id is not null) as has_pdp,
      bool_or(event_name = 'add_to_cart' and lp_click_id is not null) as has_atc
    from base
    group by session_id, coalesce(placement, lp_placement), utm_campaign
  ),
  expanded as (
    select
      ss.placement,
      ss.utm_campaign,
      bool_or(ss.has_view or exists (
        select 1 from base b
        where b.session_id = ss.session_id and b.event_name = 'lp_view'
      )) as has_view,
      bool_or(ss.has_impression) as has_impression,
      bool_or(ss.has_click) as has_click,
      bool_or(ss.has_pdp) as has_pdp,
      bool_or(ss.has_atc) as has_atc
    from session_steps ss
    where ss.placement is not null
    group by ss.session_id, ss.placement, ss.utm_campaign
  )
  select
    placement,
    utm_campaign,
    count(*) filter (where has_view) as lp_view,
    count(*) filter (where has_impression) as lp_cta_impression,
    count(*) filter (where has_click) as lp_cta_click,
    count(*) filter (where has_pdp) as pdp_view,
    count(*) filter (where has_atc) as add_to_cart,
    case when count(*) filter (where has_impression) > 0
      then round(100.0 * count(*) filter (where has_click)::numeric / count(*) filter (where has_impression), 2)
    end as click_through_rate,
    case when count(*) filter (where has_click) > 0
      then round(100.0 * count(*) filter (where has_pdp)::numeric / count(*) filter (where has_click), 2)
    end as pdp_rate,
    case when count(*) filter (where has_pdp) > 0
      then round(100.0 * count(*) filter (where has_atc)::numeric / count(*) filter (where has_pdp), 2)
    end as atc_rate,
    case when count(*) filter (where has_view) > 0
      then round(100.0 * count(*) filter (where has_atc)::numeric / count(*) filter (where has_view), 2)
    end as end_to_end_rate
  from expanded
  group by placement, utm_campaign
  order by placement, utm_campaign;
$$;

revoke all on function public.get_lp_funnel_report_range(timestamptz, timestamptz, text, boolean) from public;
grant execute on function public.get_lp_funnel_report_range(timestamptz, timestamptz, text, boolean) to authenticated;

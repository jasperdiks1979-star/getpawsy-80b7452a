-- Funnel event mirror table for /go (TikTok bio) → PDP → cart conversions.
-- Mirrors a curated subset of GA4 events into Postgres so the admin
-- dashboard can compute drop-off per CTA placement and hook campaign.

create table if not exists public.lp_funnel_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  event_name text not null,
  placement text,
  page_path text,
  product_id text,
  product_name text,
  value numeric,
  lp_click_id text,
  lp_placement text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  funnel text default 'tiktok_bio',
  is_internal boolean default false,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_lp_funnel_events_created on public.lp_funnel_events (created_at desc);
create index if not exists idx_lp_funnel_events_session on public.lp_funnel_events (session_id);
create index if not exists idx_lp_funnel_events_event on public.lp_funnel_events (event_name);
create index if not exists idx_lp_funnel_events_campaign on public.lp_funnel_events (utm_campaign);
create index if not exists idx_lp_funnel_events_placement on public.lp_funnel_events (placement);

alter table public.lp_funnel_events enable row level security;

-- Anonymous visitors may insert their own events (matches visitor_activity model).
drop policy if exists "Anyone can insert lp funnel events" on public.lp_funnel_events;
create policy "Anyone can insert lp funnel events"
  on public.lp_funnel_events
  for insert
  to anon, authenticated
  with check (true);

-- Only admins can read raw events.
drop policy if exists "Admins can read lp funnel events" on public.lp_funnel_events;
create policy "Admins can read lp funnel events"
  on public.lp_funnel_events
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Aggregated funnel report: counts + drop-off per CTA placement.
create or replace function public.get_lp_funnel_report(
  p_days integer default 14,
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
    where created_at > now() - make_interval(days => greatest(p_days, 1))
      and (p_include_internal or coalesce(is_internal, false) = false)
      and (p_campaign is null or utm_campaign = p_campaign)
  ),
  -- Buckets per session × placement so we never double count a session
  -- that re-impressed the same CTA. Step membership is binary.
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
  -- lp_view is page-level (not placement-bound), so attribute it to every
  -- placement the same session interacted with.
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

revoke all on function public.get_lp_funnel_report(integer, text, boolean) from public;
grant execute on function public.get_lp_funnel_report(integer, text, boolean) to authenticated;
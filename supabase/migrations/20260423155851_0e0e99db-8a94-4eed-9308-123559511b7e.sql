-- Last-hour breakdown of sampling decisions by page and bot state.
-- Complements get_crawler_sampling_decision_stats with a focused view
-- the admin dashboard can render as "what happened in the last hour".
create or replace function public.get_crawler_sampling_last_hour(
  p_top_pages integer default 20,
  p_minutes integer default 60
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz;
  v_minutes integer;
  v_top_pages integer;
  v_totals jsonb;
  v_by_page jsonb;
  v_by_bot_state jsonb;
  v_distinct_pages integer;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_minutes := greatest(1, least(coalesce(p_minutes, 60), 60 * 24));
  v_top_pages := greatest(1, least(coalesce(p_top_pages, 20), 200));
  v_from := now() - make_interval(mins => v_minutes);

  -- Totals envelope: gives the dashboard a one-glance "last N min" headline.
  with rows as (
    select * from public.crawler_sampling_decisions
    where created_at >= v_from
    limit 200000
  )
  select jsonb_build_object(
    'total',                 count(*)::int,
    'logged',                sum((outcome = 'logged')::int)::int,
    'sampled_out',           sum((outcome = 'sampled_out')::int)::int,
    'always_log',            sum(always_log::int)::int,
    'sampled_probabilistic', sum((not always_log)::int)::int,
    'render_trace',          sum(looks_like_render_trace::int)::int,
    'appeal',                sum(is_appeal_page::int)::int,
    'verified_bot',          sum(verified_googlebot::int)::int,
    'spoofed_bot',           sum(spoofed_googlebot::int)::int,
    'ua_claims_bot',         sum(ua_claims_googlebot::int)::int
  )
  into v_totals
  from rows;

  -- Top pages by ping volume — surfaces which slugs/paths are being kept vs
  -- dropped, which is what the user wants to see at a glance.
  select count(distinct page_url)::int
  into v_distinct_pages
  from public.crawler_sampling_decisions
  where created_at >= v_from;

  select coalesce(jsonb_agg(p order by p.total desc), '[]'::jsonb)
  into v_by_page
  from (
    select
      page_url,
      sum((outcome = 'logged')::int)::int       as logged,
      sum((outcome = 'sampled_out')::int)::int  as sampled_out,
      sum(always_log::int)::int                 as always_log,
      sum((not always_log)::int)::int           as sampled_probabilistic,
      sum(looks_like_render_trace::int)::int    as render_trace,
      sum(verified_googlebot::int)::int         as verified_bot,
      sum(spoofed_googlebot::int)::int          as spoofed_bot,
      count(*)::int                             as total
    from public.crawler_sampling_decisions
    where created_at >= v_from
    group by page_url
    order by total desc
    limit v_top_pages
  ) p;

  -- Bot-state breakdown: a 2x4 grid of (bot classification × outcome).
  -- The frontend renders this as a small matrix so you can answer
  -- "are we keeping every verified Googlebot?" in one glance.
  with classified as (
    select
      case
        when verified_googlebot then 'verified_bot'
        when spoofed_googlebot then 'spoofed_bot'
        when ua_claims_googlebot then 'ua_only_bot'
        else 'human_or_unknown'
      end as bot_state,
      outcome,
      always_log,
      looks_like_render_trace
    from public.crawler_sampling_decisions
    where created_at >= v_from
  )
  select coalesce(jsonb_agg(b order by b.total desc), '[]'::jsonb)
  into v_by_bot_state
  from (
    select
      bot_state,
      sum((outcome = 'logged')::int)::int       as logged,
      sum((outcome = 'sampled_out')::int)::int  as sampled_out,
      sum(always_log::int)::int                 as always_log,
      sum((not always_log)::int)::int           as sampled_probabilistic,
      sum(looks_like_render_trace::int)::int    as render_trace,
      count(*)::int                             as total
    from classified
    group by bot_state
  ) b;

  return jsonb_build_object(
    'window_minutes', v_minutes,
    'from',           v_from,
    'distinct_pages', coalesce(v_distinct_pages, 0),
    'totals',         v_totals,
    'by_page',        v_by_page,
    'by_bot_state',   v_by_bot_state
  );
end;
$$;
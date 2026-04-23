-- Sampling decision audit log for the log-crawler-visit edge function.
-- Each row captures *why* a request was kept or sampled out so admins can
-- later answer: "why didn't this URL get logged?" or "how often are we
-- always-logging vs sampling?".

create table if not exists public.crawler_sampling_decisions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- request fingerprint
  page_url text not null,
  user_agent text not null,
  ip_address text,

  -- outcome
  outcome text not null check (outcome in ('logged', 'sampled_out')),
  always_log boolean not null default false,
  -- High-level reason bucket; see edge function for the canonical list.
  -- Values: 'render_trace', 'appeal_page', 'verified_googlebot',
  --         'spoofed_googlebot', 'sampled_in', 'sampled_out'
  reason text not null,

  -- signal flags (denormalized so we can group/filter cheaply)
  looks_like_render_trace boolean not null default false,
  render_trace_state text,           -- 'shell' | 'rendered' | 'timeout' | null
  is_appeal_page boolean not null default false,
  ua_claims_googlebot boolean not null default false,
  verified_googlebot boolean not null default false,
  spoofed_googlebot boolean not null default false,
  bot_type text,

  -- sampling math
  sample_rate numeric(6, 4),          -- effective rate at decision time
  sample_roll numeric(6, 4)           -- the random() roll, when applicable
);

create index if not exists idx_crawler_sampling_decisions_created_at
  on public.crawler_sampling_decisions (created_at desc);

create index if not exists idx_crawler_sampling_decisions_outcome_reason
  on public.crawler_sampling_decisions (outcome, reason, created_at desc);

create index if not exists idx_crawler_sampling_decisions_page_url
  on public.crawler_sampling_decisions (page_url, created_at desc);

alter table public.crawler_sampling_decisions enable row level security;

-- Admin-only read access. Writes happen via the edge function using the
-- service role, which bypasses RLS — so no insert/update/delete policies
-- are needed for end users.
create policy "Admins can read sampling decisions"
  on public.crawler_sampling_decisions
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Aggregate RPC for the admin dashboard. Returns counts grouped by reason
-- and outcome over a sliding window, plus a breakdown of always-log vs
-- sampled-out volume so admins can tune the rate confidently.
create or replace function public.get_crawler_sampling_decision_stats(
  p_window_hours integer default 24,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz;
  v_window_hours integer;
  v_limit integer;
  v_totals jsonb;
  v_by_reason jsonb;
  v_per_hour jsonb;
  v_recent jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_window_hours := greatest(1, least(coalesce(p_window_hours, 24), 24 * 30));
  v_limit := greatest(1, least(coalesce(p_limit, 50), 500));
  v_from := now() - make_interval(hours => v_window_hours);

  with rows as (
    select * from public.crawler_sampling_decisions
    where created_at >= v_from
    limit 200000
  )
  select jsonb_build_object(
    'total',         count(*)::int,
    'logged',        sum((outcome = 'logged')::int)::int,
    'sampled_out',   sum((outcome = 'sampled_out')::int)::int,
    'always_log',    sum(always_log::int)::int,
    'render_trace',  sum(looks_like_render_trace::int)::int,
    'appeal',        sum(is_appeal_page::int)::int,
    'verified_bot',  sum(verified_googlebot::int)::int,
    'spoofed_bot',   sum(spoofed_googlebot::int)::int
  )
  into v_totals
  from rows;

  select coalesce(jsonb_agg(r order by r.count desc), '[]'::jsonb)
  into v_by_reason
  from (
    select reason, outcome, count(*)::int as count
    from public.crawler_sampling_decisions
    where created_at >= v_from
    group by reason, outcome
  ) r;

  select coalesce(jsonb_agg(h order by h.hour), '[]'::jsonb)
  into v_per_hour
  from (
    select
      to_char(date_trunc('hour', created_at) at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:00:00"Z"') as hour,
      sum((outcome = 'logged')::int)::int      as logged,
      sum((outcome = 'sampled_out')::int)::int as sampled_out
    from public.crawler_sampling_decisions
    where created_at >= v_from
    group by 1
  ) h;

  select coalesce(jsonb_agg(d order by d.created_at desc), '[]'::jsonb)
  into v_recent
  from (
    select
      id, created_at, page_url, user_agent, outcome, reason, always_log,
      looks_like_render_trace, render_trace_state, is_appeal_page,
      ua_claims_googlebot, verified_googlebot, spoofed_googlebot,
      bot_type, sample_rate, sample_roll
    from public.crawler_sampling_decisions
    where created_at >= v_from
    order by created_at desc
    limit v_limit
  ) d;

  return jsonb_build_object(
    'window_hours', v_window_hours,
    'from',         v_from,
    'totals',       v_totals,
    'by_reason',    v_by_reason,
    'per_hour',     v_per_hour,
    'recent',       v_recent
  );
end;
$$;

grant execute on function public.get_crawler_sampling_decision_stats(integer, integer)
  to authenticated;
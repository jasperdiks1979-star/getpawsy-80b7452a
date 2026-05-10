
-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 5 + 6 — Pinterest Learning Loop & Conversion Intelligence
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. pinterest_performance_signals — per-dimension aggregated KPIs
create table if not exists public.pinterest_performance_signals (
  id uuid primary key default gen_random_uuid(),
  -- Dimension keys (composite uniqueness below)
  niche_key text not null,
  pin_mode text,
  hook_category text,
  pattern_id text,
  board_id text,
  product_category text,
  cta text,
  backdrop_style text,
  -- Pinterest funnel
  impressions integer not null default 0,
  saves integer not null default 0,
  outbound integer not null default 0,
  -- On-site funnel (joined from analytics)
  sessions integer not null default 0,
  session_seconds bigint not null default 0,
  add_to_cart integer not null default 0,
  checkout integer not null default 0,
  purchase integer not null default 0,
  revenue numeric(12,2) not null default 0,
  sample_size integer not null default 0,
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists pps_dim_uniq
  on public.pinterest_performance_signals (
    niche_key,
    coalesce(pin_mode, ''),
    coalesce(hook_category, ''),
    coalesce(pattern_id, ''),
    coalesce(board_id, ''),
    coalesce(product_category, ''),
    coalesce(cta, ''),
    coalesce(backdrop_style, '')
  );

create index if not exists pps_niche_mode_idx
  on public.pinterest_performance_signals (niche_key, pin_mode, sample_size desc);

alter table public.pinterest_performance_signals enable row level security;

create policy "admins manage performance signals"
  on public.pinterest_performance_signals
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));


-- 2. pinterest_winner_dimensions — distilled winners per (niche × pin_mode × hook)
create table if not exists public.pinterest_winner_dimensions (
  id uuid primary key default gen_random_uuid(),
  niche_key text not null,
  pin_mode text,
  hook_category text,
  pattern_id text,
  composite_score numeric(6,3) not null default 0,
  save_rate numeric(6,4),
  outbound_rate numeric(6,4),
  conversion_rate numeric(6,4),
  revenue_per_impression numeric(10,6),
  sample_size integer not null default 0,
  is_active boolean not null default true,
  computed_at timestamptz not null default now()
);

create unique index if not exists pwd_dim_uniq
  on public.pinterest_winner_dimensions (
    niche_key,
    coalesce(pin_mode, ''),
    coalesce(hook_category, ''),
    coalesce(pattern_id, '')
  );

create index if not exists pwd_lookup_idx
  on public.pinterest_winner_dimensions (niche_key, pin_mode, composite_score desc)
  where is_active = true;

alter table public.pinterest_winner_dimensions enable row level security;

create policy "admins manage winner dimensions"
  on public.pinterest_winner_dimensions
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));


-- 3. pinterest_attribution_sessions — per-visit attribution memory
create table if not exists public.pinterest_attribution_sessions (
  id uuid primary key default gen_random_uuid(),
  session_key text not null,                  -- random cookie value
  pin_id text,
  pin_mode text,
  landing_slug text,
  niche_key text,
  hook_category text,
  utm_source text,
  utm_campaign text,
  utm_content text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  events_seen integer not null default 1
);

create unique index if not exists pas_session_uniq
  on public.pinterest_attribution_sessions (session_key);

create index if not exists pas_pin_idx
  on public.pinterest_attribution_sessions (pin_id, last_seen desc);

alter table public.pinterest_attribution_sessions enable row level security;

create policy "admins read attribution sessions"
  on public.pinterest_attribution_sessions
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "anon insert attribution sessions"
  on public.pinterest_attribution_sessions
  for insert
  to anon, authenticated
  with check (true);

create policy "anon update own attribution session"
  on public.pinterest_attribution_sessions
  for update
  to anon, authenticated
  using (true)
  with check (true);


-- 4. pinterest_capi_outbox — queued Pinterest Conversion API events
create table if not exists public.pinterest_capi_outbox (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,                   -- view_content, add_to_cart, checkout, purchase
  event_id text not null,
  event_time timestamptz not null default now(),
  pin_id text,
  pin_mode text,
  niche_key text,
  product_id text,
  value numeric(12,2),
  currency text default 'USD',
  user_data jsonb,                            -- hashed email/phone/click_id/etc
  custom_data jsonb,
  status text not null default 'pending',     -- pending | sent | failed | skipped
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists pco_event_uniq
  on public.pinterest_capi_outbox (event_name, event_id);

create index if not exists pco_status_idx
  on public.pinterest_capi_outbox (status, created_at)
  where status = 'pending';

alter table public.pinterest_capi_outbox enable row level security;

create policy "admins read capi outbox"
  on public.pinterest_capi_outbox
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "admins manage capi outbox"
  on public.pinterest_capi_outbox
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "anon insert capi outbox"
  on public.pinterest_capi_outbox
  for insert
  to anon, authenticated
  with check (true);

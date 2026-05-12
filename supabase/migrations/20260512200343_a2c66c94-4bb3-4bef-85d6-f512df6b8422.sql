
create table if not exists public.mi_experiments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  placement text not null default 'pinterest',
  hook_family text,
  status text not null default 'running',
  winner_variant_id uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mi_experiment_variants (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.mi_experiments(id) on delete cascade,
  remix_draft_id uuid,
  pin_queue_id uuid,
  label text not null,
  impressions integer not null default 0,
  clicks integer not null default 0,
  conversions integer not null default 0,
  posterior_win_prob numeric not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_mi_exp_variants_exp on public.mi_experiment_variants(experiment_id);

create table if not exists public.mi_experiment_events (
  id bigserial primary key,
  variant_id uuid not null references public.mi_experiment_variants(id) on delete cascade,
  event_type text not null,
  weight integer not null default 1,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists idx_mi_exp_events_variant on public.mi_experiment_events(variant_id, occurred_at desc);

alter table public.mi_experiments enable row level security;
alter table public.mi_experiment_variants enable row level security;
alter table public.mi_experiment_events enable row level security;

create policy "admins manage mi_experiments" on public.mi_experiments
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "admins manage mi_experiment_variants" on public.mi_experiment_variants
  for all to authenticated using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

create policy "admins read mi_experiment_events" on public.mi_experiment_events
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

create policy "service inserts mi_experiment_events" on public.mi_experiment_events
  for insert to authenticated with check (public.has_role(auth.uid(), 'admin'));

create trigger trg_mi_experiments_updated before update on public.mi_experiments
  for each row execute function public.update_updated_at_column();
create trigger trg_mi_exp_variants_updated before update on public.mi_experiment_variants
  for each row execute function public.update_updated_at_column();

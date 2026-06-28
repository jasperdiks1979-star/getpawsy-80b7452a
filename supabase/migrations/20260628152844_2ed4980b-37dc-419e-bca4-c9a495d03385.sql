
create table public.pcie2_trait_weights (
  id uuid primary key default gen_random_uuid(),
  dimension text not null,
  value text not null,
  weight numeric not null default 1.0,
  prev_weight numeric not null default 1.0,
  status text not null default 'observational',
  sample_n int not null default 0,
  confidence numeric not null default 0,
  ctr_lift numeric,
  save_lift numeric,
  rev_lift numeric,
  purchase_lift numeric,
  trend numeric default 0,
  stability numeric default 0,
  evidence_age_days int default 0,
  evidence_window_days int default 30,
  last_reason text,
  first_seen_at timestamptz not null default now(),
  last_evaluated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(dimension, value)
);
grant select on public.pcie2_trait_weights to authenticated;
grant all on public.pcie2_trait_weights to service_role;
alter table public.pcie2_trait_weights enable row level security;
create policy "admins read trait_weights" on public.pcie2_trait_weights for select to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.pcie2_trait_weight_history (
  id uuid primary key default gen_random_uuid(),
  dimension text not null,
  value text not null,
  old_weight numeric not null,
  new_weight numeric not null,
  delta numeric not null,
  reason text not null,
  evidence jsonb,
  run_id uuid,
  created_at timestamptz not null default now()
);
grant select on public.pcie2_trait_weight_history to authenticated;
grant all on public.pcie2_trait_weight_history to service_role;
alter table public.pcie2_trait_weight_history enable row level security;
create policy "admins read trait_weight_history" on public.pcie2_trait_weight_history for select to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.pcie2_evidence_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  traits_evaluated int default 0,
  traits_promoted int default 0,
  traits_demoted int default 0,
  traits_observed int default 0,
  avg_confidence numeric,
  learning_velocity numeric,
  summary jsonb
);
grant select on public.pcie2_evidence_runs to authenticated;
grant all on public.pcie2_evidence_runs to service_role;
alter table public.pcie2_evidence_runs enable row level security;
create policy "admins read evidence_runs" on public.pcie2_evidence_runs for select to authenticated using (public.has_role(auth.uid(),'admin'));

create index if not exists idx_trait_weights_status on public.pcie2_trait_weights(status, weight desc);
create index if not exists idx_trait_weights_updated on public.pcie2_trait_weights(updated_at desc);
create index if not exists idx_trait_history_created on public.pcie2_trait_weight_history(created_at desc);

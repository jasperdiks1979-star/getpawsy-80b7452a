create table if not exists public.conversion_repairs (id uuid primary key default gen_random_uuid(), category text not null, problem text not null, evidence jsonb not null default '{}'::jsonb, severity text not null default 'medium', risk_score int not null default 50, status text not null default 'proposed', auto_safe boolean not null default false, before_state jsonb, after_state jsonb, expected_impact jsonb, observed_impact jsonb, rollback jsonb, created_at timestamptz not null default now(), executed_at timestamptz, rolled_back_at timestamptz, created_by text default 'genesis-v11.2');
grant select, insert, update, delete on public.conversion_repairs to authenticated;
grant all on public.conversion_repairs to service_role;
alter table public.conversion_repairs enable row level security;
create policy "admins read repairs" on public.conversion_repairs for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admins write repairs" on public.conversion_repairs for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table if not exists public.conversion_experiments (id uuid primary key default gen_random_uuid(), repair_id uuid references public.conversion_repairs(id) on delete set null, name text not null, hypothesis text, split jsonb not null default '{"a":50,"b":50}'::jsonb, status text not null default 'draft', metrics jsonb default '{}'::jsonb, confidence numeric, lift numeric, started_at timestamptz, ended_at timestamptz, created_at timestamptz not null default now());
grant select, insert, update, delete on public.conversion_experiments to authenticated;
grant all on public.conversion_experiments to service_role;
alter table public.conversion_experiments enable row level security;
create policy "admins read exp" on public.conversion_experiments for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admins write exp" on public.conversion_experiments for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table if not exists public.conversion_repair_logs (id uuid primary key default gen_random_uuid(), repair_id uuid references public.conversion_repairs(id) on delete cascade, action text not null, details jsonb, created_at timestamptz not null default now());
grant select, insert on public.conversion_repair_logs to authenticated;
grant all on public.conversion_repair_logs to service_role;
alter table public.conversion_repair_logs enable row level security;
create policy "admins read logs" on public.conversion_repair_logs for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admins insert logs" on public.conversion_repair_logs for insert to authenticated with check (public.has_role(auth.uid(),'admin'));

create table if not exists public.conversion_knowledge (id uuid primary key default gen_random_uuid(), pattern text not null, lesson text not null, success boolean not null, evidence jsonb, created_at timestamptz not null default now());
grant select, insert on public.conversion_knowledge to authenticated;
grant all on public.conversion_knowledge to service_role;
alter table public.conversion_knowledge enable row level security;
create policy "admins read kn" on public.conversion_knowledge for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admins insert kn" on public.conversion_knowledge for insert to authenticated with check (public.has_role(auth.uid(),'admin'));

create index if not exists idx_repairs_status on public.conversion_repairs(status);
create index if not exists idx_repairs_category on public.conversion_repairs(category);
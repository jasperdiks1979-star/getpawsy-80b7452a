create table if not exists public.genesis_constitution (
  id uuid primary key default gen_random_uuid(),
  article_number int not null unique,
  title text not null,
  body text not null,
  ratified_at timestamptz not null default now(),
  sha256 text not null
);
grant select on public.genesis_constitution to authenticated;
grant all on public.genesis_constitution to service_role;
alter table public.genesis_constitution enable row level security;
create policy "admins read constitution" on public.genesis_constitution for select to authenticated using (public.has_role(auth.uid(),'admin'));
-- No update/delete policies => immutable from Data API.

create table if not exists public.genesis_compliance_certifications (
  id uuid primary key default gen_random_uuid(),
  genesis_version text not null,
  compliance_score int not null,
  revenue_protection_score int not null,
  evidence_integrity_score int not null,
  safety_score int not null,
  trust_score int not null,
  automation_governance_score int not null,
  financial_integrity_score int not null,
  executive_readiness_score int not null,
  overall_score int not null,
  findings jsonb default '[]'::jsonb,
  sha256 text not null,
  certified_at timestamptz not null default now()
);
grant select on public.genesis_compliance_certifications to authenticated;
grant all on public.genesis_compliance_certifications to service_role;
alter table public.genesis_compliance_certifications enable row level security;
create policy "admins read certs" on public.genesis_compliance_certifications for select to authenticated using (public.has_role(auth.uid(),'admin'));
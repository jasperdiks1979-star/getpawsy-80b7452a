create table if not exists public.pinterest_pattern_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null,
  pattern_id text not null,
  patch jsonb not null,
  source text not null check (source in ('curated','perplexity_refresh','manual')),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.pinterest_pattern_versions enable row level security;

drop policy if exists "admins manage pattern versions" on public.pinterest_pattern_versions;
create policy "admins manage pattern versions"
  on public.pinterest_pattern_versions
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create index if not exists idx_ppv_pattern_version
  on public.pinterest_pattern_versions(pattern_id, version desc);
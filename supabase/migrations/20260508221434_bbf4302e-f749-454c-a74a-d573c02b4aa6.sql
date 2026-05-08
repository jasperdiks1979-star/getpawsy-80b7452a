create table if not exists public.product_creative_profiles (
  product_id uuid primary key references public.products(id) on delete cascade,
  niche_key text not null,
  profile jsonb not null,
  briefs_version int not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.product_creative_profiles enable row level security;

drop policy if exists "admins manage creative profiles" on public.product_creative_profiles;
create policy "admins manage creative profiles"
  on public.product_creative_profiles
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create index if not exists idx_pcp_niche on public.product_creative_profiles(niche_key);
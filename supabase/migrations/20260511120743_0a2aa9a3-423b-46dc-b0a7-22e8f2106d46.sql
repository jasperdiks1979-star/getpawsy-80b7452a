
-- Pinterest Video Publisher: separate tables, isolated from image pin queue.

create table if not exists public.pinterest_video_assets (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_bucket text not null,
  storage_path text not null,
  public_url text not null,
  thumbnail_url text,
  duration_seconds numeric,
  aspect_ratio text,
  filesize_bytes bigint,
  hook_type text not null default 'unknown',
  product_slug text not null default 'automatic-cat-litter-box-self-cleaning-app-control',
  content_hash text not null unique,
  is_active boolean not null default true,
  last_publish_at timestamptz,
  publish_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pinterest_video_queue (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.pinterest_video_assets(id) on delete cascade,
  status text not null default 'draft',
  title text not null,
  description text not null,
  hashtags text[] not null default '{}',
  cta_text text,
  cover_frame_seconds numeric,
  board_id text,
  destination_url text not null,
  scheduled_at timestamptz,
  pin_id text,
  external_url text,
  error_message text,
  attempt_count integer not null default 0,
  variation_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pvq_status on public.pinterest_video_queue(status);
create index if not exists idx_pvq_asset on public.pinterest_video_queue(asset_id);
create unique index if not exists uq_pvq_asset_variation on public.pinterest_video_queue(asset_id, variation_hash);

create table if not exists public.pinterest_video_publish_log (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.pinterest_video_queue(id) on delete cascade,
  stage text not null,
  status text not null,
  payload jsonb,
  trace_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_pvpl_queue on public.pinterest_video_publish_log(queue_id);

create table if not exists public.pinterest_video_metrics (
  id uuid primary key default gen_random_uuid(),
  pin_id text not null,
  asset_id uuid references public.pinterest_video_assets(id) on delete set null,
  impressions integer not null default 0,
  outbound_clicks integer not null default 0,
  saves integer not null default 0,
  ctr numeric,
  engagement_rate numeric,
  day date not null default current_date,
  fetched_at timestamptz not null default now(),
  unique(pin_id, day)
);

create table if not exists public.pinterest_video_autopilot_settings (
  id integer primary key default 1,
  enabled boolean not null default false,
  mode text not null default 'drafts_only',
  max_per_day integer not null default 4,
  preferred_hook_types text[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint pvas_singleton check (id = 1)
);
insert into public.pinterest_video_autopilot_settings (id) values (1) on conflict (id) do nothing;

-- updated_at triggers
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists pva_touch on public.pinterest_video_assets;
create trigger pva_touch before update on public.pinterest_video_assets
  for each row execute function public.touch_updated_at();
drop trigger if exists pvq_touch on public.pinterest_video_queue;
create trigger pvq_touch before update on public.pinterest_video_queue
  for each row execute function public.touch_updated_at();

-- RLS — admin only
alter table public.pinterest_video_assets enable row level security;
alter table public.pinterest_video_queue enable row level security;
alter table public.pinterest_video_publish_log enable row level security;
alter table public.pinterest_video_metrics enable row level security;
alter table public.pinterest_video_autopilot_settings enable row level security;

create policy "admin all pva" on public.pinterest_video_assets
  for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin all pvq" on public.pinterest_video_queue
  for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin all pvpl" on public.pinterest_video_publish_log
  for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin all pvm" on public.pinterest_video_metrics
  for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "admin all pvas" on public.pinterest_video_autopilot_settings
  for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- Winners view (top hooks/durations)
create or replace view public.pinterest_video_winners as
select
  a.hook_type,
  a.id as asset_id,
  a.filename,
  a.duration_seconds,
  coalesce(sum(m.impressions),0) as impressions,
  coalesce(sum(m.outbound_clicks),0) as outbound_clicks,
  coalesce(sum(m.saves),0) as saves,
  case when coalesce(sum(m.impressions),0) > 0
       then round(sum(m.outbound_clicks)::numeric / sum(m.impressions) * 100, 2)
       else 0 end as ctr_pct
from public.pinterest_video_assets a
left join public.pinterest_video_metrics m on m.asset_id = a.id
group by a.id;

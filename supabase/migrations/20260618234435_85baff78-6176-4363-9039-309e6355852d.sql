
CREATE TABLE public.cinematic_v3_quality_audit (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.cinematic_v3_jobs(id) on delete cascade,
  product_slug text,
  mp4_url text,
  safe_area_ok boolean not null default true,
  caption_clipped boolean not null default false,
  supplier_collage boolean not null default false,
  low_res_source boolean not null default false,
  zoom_pan_only boolean not null default false,
  hook_present boolean not null default true,
  benefit_present boolean not null default true,
  cta_present boolean not null default true,
  branding_ok boolean not null default true,
  quality_score int not null default 0,
  verdict text not null default 'review' check (verdict in ('approved','review','rejected')),
  issues jsonb not null default '[]'::jsonb,
  audited_at timestamptz not null default now(),
  unique(job_id)
);
GRANT SELECT ON public.cinematic_v3_quality_audit TO authenticated;
GRANT ALL ON public.cinematic_v3_quality_audit TO service_role;
ALTER TABLE public.cinematic_v3_quality_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read v3 audit" ON public.cinematic_v3_quality_audit
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.cinematic_v4_jobs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid,
  product_slug text not null,
  status text not null default 'pending' check (status in ('pending','scripting','rendering','approved','rejected','failed')),
  script_json jsonb,
  scene_assets jsonb,
  storyboard jsonb,
  final_mp4_url text,
  duration_seconds numeric,
  quality_score int,
  quality_report jsonb,
  rejection_reasons text[] not null default '{}',
  github_run_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);
GRANT SELECT ON public.cinematic_v4_jobs TO authenticated;
GRANT ALL ON public.cinematic_v4_jobs TO service_role;
ALTER TABLE public.cinematic_v4_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read v4 jobs" ON public.cinematic_v4_jobs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.cinematic_v4_safe_zone_config (
  id uuid primary key default gen_random_uuid(),
  canvas_width int not null default 1080,
  canvas_height int not null default 1920,
  top_reserve_pct numeric not null default 15,
  bottom_reserve_pct numeric not null default 20,
  side_reserve_px int not null default 108,
  min_font_px int not null default 48,
  max_font_px int not null default 96,
  max_lines int not null default 4,
  min_source_image_px int not null default 1200,
  approval_threshold int not null default 90,
  brand_logo_url text,
  brand_primary text default '#0F172A',
  brand_accent text default '#3B82F6',
  penalty_safe_area int not null default 25,
  penalty_caption_clipped int not null default 20,
  penalty_supplier_collage int not null default 30,
  penalty_low_res int not null default 15,
  penalty_zoom_pan_only int not null default 15,
  penalty_missing_hook int not null default 15,
  penalty_missing_benefit int not null default 10,
  penalty_missing_cta int not null default 20,
  penalty_branding int not null default 10,
  updated_at timestamptz not null default now()
);
GRANT SELECT ON public.cinematic_v4_safe_zone_config TO authenticated;
GRANT ALL ON public.cinematic_v4_safe_zone_config TO service_role;
ALTER TABLE public.cinematic_v4_safe_zone_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read v4 safe zone" ON public.cinematic_v4_safe_zone_config
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

INSERT INTO public.cinematic_v4_safe_zone_config DEFAULT VALUES;

ALTER TABLE public.pinterest_runtime_settings
  ADD COLUMN IF NOT EXISTS v3_publish_paused boolean NOT NULL DEFAULT true;

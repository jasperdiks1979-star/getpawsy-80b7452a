CREATE TABLE IF NOT EXISTS public.pinterest_voice_assignments (
  id uuid primary key default gen_random_uuid(),
  pin_id text,
  queue_id uuid,
  cinematic_job_id uuid,
  product_id uuid,
  product_slug text,
  category text,
  voice_name text not null,
  voice_type text not null,
  voice_style text not null,
  elevenlabs_voice_id text not null,
  assigned_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS pinterest_voice_assignments_assigned_idx ON public.pinterest_voice_assignments(assigned_at DESC);
CREATE INDEX IF NOT EXISTS pinterest_voice_assignments_cat_idx ON public.pinterest_voice_assignments(category, assigned_at DESC);
CREATE INDEX IF NOT EXISTS pinterest_voice_assignments_pin_idx ON public.pinterest_voice_assignments(pin_id);

GRANT SELECT ON public.pinterest_voice_assignments TO authenticated;
GRANT ALL ON public.pinterest_voice_assignments TO service_role;
ALTER TABLE public.pinterest_voice_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_select_voice_assignments" ON public.pinterest_voice_assignments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service_all_voice_assignments" ON public.pinterest_voice_assignments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pinterest_voice_performance (
  id uuid primary key default gen_random_uuid(),
  voice_name text not null,
  category text not null,
  pins_count int not null default 0,
  impressions bigint not null default 0,
  ctr numeric not null default 0,
  outbound_clicks bigint not null default 0,
  saves bigint not null default 0,
  purchases bigint not null default 0,
  conversion_score numeric not null default 0,
  updated_at timestamptz not null default now(),
  UNIQUE(voice_name, category)
);

GRANT SELECT ON public.pinterest_voice_performance TO authenticated;
GRANT ALL ON public.pinterest_voice_performance TO service_role;
ALTER TABLE public.pinterest_voice_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_select_voice_performance" ON public.pinterest_voice_performance
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service_all_voice_performance" ON public.pinterest_voice_performance
  FOR ALL TO service_role USING (true) WITH CHECK (true);
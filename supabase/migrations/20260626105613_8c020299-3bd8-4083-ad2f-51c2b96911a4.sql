
-- Pinterest Quality Intelligence Firewall v2: verdict + audit + learning tables
CREATE TABLE IF NOT EXISTS public.pqif_verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid,
  product_id uuid,
  stage text NOT NULL, -- 'pre_publish' | 'post_publish' | 'nightly_audit'
  decision text NOT NULL, -- 'pass' | 'block' | 'warn' | 'repair'
  overall_score numeric(5,2),
  threshold numeric(5,2),
  scores jsonb NOT NULL DEFAULT '{}'::jsonb, -- {emotion, ctr, intent, seo, composition, mobile, branding}
  checks jsonb NOT NULL DEFAULT '{}'::jsonb, -- per-check pass/fail with reason
  reasons text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pqif_verdicts TO authenticated;
GRANT ALL ON public.pqif_verdicts TO service_role;
ALTER TABLE public.pqif_verdicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pqif_verdicts_admin_read" ON public.pqif_verdicts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_pqif_verdicts_queue ON public.pqif_verdicts(queue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pqif_verdicts_stage ON public.pqif_verdicts(stage, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pqif_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  pins_checked integer NOT NULL DEFAULT 0,
  ghosts_found integer NOT NULL DEFAULT 0,
  orphans_cleared integer NOT NULL DEFAULT 0,
  broken_urls integer NOT NULL DEFAULT 0,
  deleted_products integer NOT NULL DEFAULT 0,
  duplicates_found integer NOT NULL DEFAULT 0,
  repairs_applied integer NOT NULL DEFAULT 0,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.pqif_audit_runs TO authenticated;
GRANT ALL ON public.pqif_audit_runs TO service_role;
ALTER TABLE public.pqif_audit_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pqif_audit_runs_admin_read" ON public.pqif_audit_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.pqif_family_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_key text NOT NULL,
  family_type text NOT NULL, -- 'creative' | 'headline' | 'hook' | 'visual_dna'
  pins_published integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  outbound_clicks integer NOT NULL DEFAULT 0,
  conversions integer NOT NULL DEFAULT 0,
  ctr numeric(6,4) NOT NULL DEFAULT 0,
  engagement_rate numeric(6,4) NOT NULL DEFAULT 0,
  conversion_rate numeric(6,4) NOT NULL DEFAULT 0,
  performance_score numeric(5,2) NOT NULL DEFAULT 0,
  frequency_multiplier numeric(4,2) NOT NULL DEFAULT 1.0,
  last_evaluated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(family_type, family_key)
);
GRANT SELECT ON public.pqif_family_performance TO authenticated;
GRANT ALL ON public.pqif_family_performance TO service_role;
ALTER TABLE public.pqif_family_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pqif_family_perf_admin_read" ON public.pqif_family_performance FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.pqif_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  quality_threshold numeric(5,2) NOT NULL DEFAULT 75.0,
  similarity_threshold numeric(4,3) NOT NULL DEFAULT 0.88,
  min_image_width integer NOT NULL DEFAULT 1000,
  min_image_height integer NOT NULL DEFAULT 1500,
  product_cooldown_hours integer NOT NULL DEFAULT 48,
  retire_ctr_below numeric(6,4) NOT NULL DEFAULT 0.0025,
  retire_after_impressions integer NOT NULL DEFAULT 500,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pqif_settings TO authenticated;
GRANT ALL ON public.pqif_settings TO service_role;
ALTER TABLE public.pqif_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pqif_settings_admin_read" ON public.pqif_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
INSERT INTO public.pqif_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

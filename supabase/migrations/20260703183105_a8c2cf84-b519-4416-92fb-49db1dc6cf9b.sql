
CREATE TABLE IF NOT EXISTS public.pinterest_hero_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  creative_dna_id uuid REFERENCES public.pei_creative_dna(id) ON DELETE SET NULL,
  pinterest_pin_id text,
  before_image_url text,
  after_image_url text NOT NULL,
  before_images jsonb,
  reason text NOT NULL DEFAULT 'master_creative_promoted',
  rolled_back_at timestamptz,
  rolled_back_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT ON public.pinterest_hero_sync_log TO authenticated;
GRANT ALL ON public.pinterest_hero_sync_log TO service_role;
ALTER TABLE public.pinterest_hero_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hero_sync_admin_read" ON public.pinterest_hero_sync_log
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "hero_sync_service" ON public.pinterest_hero_sync_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_hero_sync_product ON public.pinterest_hero_sync_log(product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pinterest_integrity_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at timestamptz NOT NULL DEFAULT now(),
  run_id uuid,
  pins_audited int NOT NULL DEFAULT 0,
  pins_pass int NOT NULL DEFAULT 0,
  pins_warning int NOT NULL DEFAULT 0,
  pins_fail int NOT NULL DEFAULT 0,
  pins_archived int NOT NULL DEFAULT 0,
  pins_repaired int NOT NULL DEFAULT 0,
  hero_syncs int NOT NULL DEFAULT 0,
  wrong_url_fixed int NOT NULL DEFAULT 0,
  visual_mismatches int NOT NULL DEFAULT 0,
  expected_revenue_recovered numeric,
  storage_prefix text NOT NULL,
  json_path text,
  csv_path text,
  html_path text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.pinterest_integrity_reports TO authenticated;
GRANT ALL ON public.pinterest_integrity_reports TO service_role;
ALTER TABLE public.pinterest_integrity_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integrity_reports_admin_read" ON public.pinterest_integrity_reports
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "integrity_reports_service" ON public.pinterest_integrity_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

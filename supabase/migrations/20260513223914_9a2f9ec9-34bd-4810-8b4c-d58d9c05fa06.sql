
-- Cinematic ad jobs queue + storage bucket
CREATE TABLE IF NOT EXISTS public.cinematic_ad_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL,
  hook_variant text NOT NULL DEFAULT 'default',
  status text NOT NULL DEFAULT 'pending',
  status_message text,
  voice_id text NOT NULL DEFAULT 'EXAVITQu4vr4xnSDxMaL',
  vo_script text,
  vo_url text,
  music_url text,
  scene_specs jsonb NOT NULL DEFAULT '[]'::jsonb,
  scene_assets jsonb NOT NULL DEFAULT '[]'::jsonb,
  output_mp4_url text,
  output_thumbnail_url text,
  output_duration_seconds numeric,
  pinterest_asset_id uuid REFERENCES public.pinterest_video_assets(id) ON DELETE SET NULL,
  pushed_to_pinterest_at timestamptz,
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  prepared_at timestamptz,
  rendered_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_status ON public.cinematic_ad_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_product ON public.cinematic_ad_jobs(product_slug);

ALTER TABLE public.cinematic_ad_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin all cinematic_ad_jobs"
  ON public.cinematic_ad_jobs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER cinematic_ad_jobs_touch
  BEFORE UPDATE ON public.cinematic_ad_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('cinematic-ads', 'cinematic-ads', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read cinematic-ads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'cinematic-ads');

CREATE POLICY "Admin write cinematic-ads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'cinematic-ads' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin update cinematic-ads"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'cinematic-ads' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin delete cinematic-ads"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'cinematic-ads' AND has_role(auth.uid(), 'admin'::app_role));

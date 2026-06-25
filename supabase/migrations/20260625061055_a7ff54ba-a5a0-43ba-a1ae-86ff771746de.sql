
-- 1. Sync runs
CREATE TABLE public.cj_media_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL DEFAULT 'delta',
  status TEXT NOT NULL DEFAULT 'running',
  products_scanned INT NOT NULL DEFAULT 0,
  products_processed INT NOT NULL DEFAULT 0,
  images_rehosted INT NOT NULL DEFAULT 0,
  videos_rehosted INT NOT NULL DEFAULT 0,
  derivatives_enqueued INT NOT NULL DEFAULT 0,
  failures INT NOT NULL DEFAULT 0,
  storage_bytes_added BIGINT NOT NULL DEFAULT 0,
  notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cj_media_sync_runs TO authenticated;
GRANT ALL ON public.cj_media_sync_runs TO service_role;
ALTER TABLE public.cj_media_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read sync runs" ON public.cj_media_sync_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. Asset registry
CREATE TABLE public.cj_media_asset_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  kind TEXT NOT NULL,
  role TEXT,
  source_url TEXT,
  storage_path TEXT NOT NULL,
  public_url TEXT,
  checksum TEXT,
  width INT,
  height INT,
  bytes BIGINT,
  quality_score NUMERIC,
  derived_from UUID REFERENCES public.cj_media_asset_registry(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cj_media_asset_registry_product_checksum_idx
  ON public.cj_media_asset_registry(product_id, checksum) WHERE checksum IS NOT NULL;
CREATE INDEX cj_media_asset_registry_product_idx ON public.cj_media_asset_registry(product_id);
CREATE INDEX cj_media_asset_registry_kind_idx ON public.cj_media_asset_registry(kind);
GRANT SELECT ON public.cj_media_asset_registry TO authenticated;
GRANT ALL ON public.cj_media_asset_registry TO service_role;
ALTER TABLE public.cj_media_asset_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read asset registry" ON public.cj_media_asset_registry
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. Derivative jobs
CREATE TABLE public.cj_media_derivative_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES public.cj_media_asset_registry(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  source_url TEXT NOT NULL,
  derivative_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  last_error TEXT,
  output_path TEXT,
  output_url TEXT,
  output_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX cj_media_derivative_jobs_status_idx
  ON public.cj_media_derivative_jobs(status) WHERE status IN ('pending','failed');
GRANT SELECT ON public.cj_media_derivative_jobs TO authenticated;
GRANT ALL ON public.cj_media_derivative_jobs TO service_role;
ALTER TABLE public.cj_media_derivative_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read derivative jobs" ON public.cj_media_derivative_jobs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.cj_media_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER cj_media_asset_registry_touch
  BEFORE UPDATE ON public.cj_media_asset_registry
  FOR EACH ROW EXECUTE FUNCTION public.cj_media_touch_updated_at();

CREATE TRIGGER cj_media_derivative_jobs_touch
  BEFORE UPDATE ON public.cj_media_derivative_jobs
  FOR EACH ROW EXECUTE FUNCTION public.cj_media_touch_updated_at();

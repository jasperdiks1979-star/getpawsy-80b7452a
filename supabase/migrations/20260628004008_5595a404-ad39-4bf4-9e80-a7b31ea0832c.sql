CREATE TABLE IF NOT EXISTS public.pinterest_creative_factory_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_queue_id uuid REFERENCES public.pinterest_pin_queue(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  product_slug text,
  product_name text,
  stage text NOT NULL DEFAULT 'discovery',
  status text NOT NULL DEFAULT 'pending',
  priority integer NOT NULL DEFAULT 100,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  lease_owner text,
  leased_until timestamptz,
  prompt jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  media_url text,
  media_hash text,
  error_message text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'creative_factory_v1',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pin_queue_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_creative_factory_jobs TO authenticated;
GRANT ALL ON public.pinterest_creative_factory_jobs TO service_role;
ALTER TABLE public.pinterest_creative_factory_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage pinterest creative factory jobs"
  ON public.pinterest_creative_factory_jobs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_pcfj_status_stage_priority ON public.pinterest_creative_factory_jobs(status, stage, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_pcfj_pin_queue_id ON public.pinterest_creative_factory_jobs(pin_queue_id);
CREATE INDEX IF NOT EXISTS idx_pcfj_lease ON public.pinterest_creative_factory_jobs(leased_until) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS public.pinterest_creative_factory_settings (
  id integer PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  min_ready_pins integer NOT NULL DEFAULT 100,
  min_ready_media integer NOT NULL DEFAULT 200,
  min_ready_prompts integer NOT NULL DEFAULT 300,
  max_jobs_per_run integer NOT NULL DEFAULT 3,
  max_concurrency integer NOT NULL DEFAULT 1,
  retry_backoff_minutes integer NOT NULL DEFAULT 20,
  model text NOT NULL DEFAULT 'google/gemini-3.1-flash-image',
  quality_threshold integer NOT NULL DEFAULT 70,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pinterest_creative_factory_settings_singleton CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_creative_factory_settings TO authenticated;
GRANT ALL ON public.pinterest_creative_factory_settings TO service_role;
ALTER TABLE public.pinterest_creative_factory_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage pinterest creative factory settings"
  ON public.pinterest_creative_factory_settings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.pinterest_creative_factory_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tg_pinterest_creative_factory_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_pcfj_updated_at ON public.pinterest_creative_factory_jobs;
CREATE TRIGGER trg_pcfj_updated_at
BEFORE UPDATE ON public.pinterest_creative_factory_jobs
FOR EACH ROW EXECUTE FUNCTION public.tg_pinterest_creative_factory_updated_at();
DROP TRIGGER IF EXISTS trg_pcfs_updated_at ON public.pinterest_creative_factory_settings;
CREATE TRIGGER trg_pcfs_updated_at
BEFORE UPDATE ON public.pinterest_creative_factory_settings
FOR EACH ROW EXECUTE FUNCTION public.tg_pinterest_creative_factory_updated_at();
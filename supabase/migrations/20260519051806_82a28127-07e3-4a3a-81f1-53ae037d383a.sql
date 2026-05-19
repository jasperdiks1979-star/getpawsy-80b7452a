
-- Singleton config
CREATE TABLE IF NOT EXISTS public.pinterest_autopilot_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT false,
  daily_post_target INTEGER NOT NULL DEFAULT 5,
  min_gap_minutes INTEGER NOT NULL DEFAULT 180,
  quality_threshold INTEGER NOT NULL DEFAULT 70,
  last_schedule_generated_for DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pinterest_autopilot_config_singleton CHECK (id = 1)
);

INSERT INTO public.pinterest_autopilot_config (id, enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pinterest_autopilot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage autopilot config"
  ON public.pinterest_autopilot_config FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Schedule table
CREATE TABLE IF NOT EXISTS public.pinterest_autopilot_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_at TIMESTAMPTZ NOT NULL,
  scheduled_date DATE NOT NULL,
  product_slug TEXT NOT NULL,
  product_id UUID,
  product_name TEXT,
  product_image TEXT,
  product_url TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  cinematic_ad_job_id UUID REFERENCES public.cinematic_ad_jobs(id) ON DELETE SET NULL,
  creative_angle TEXT,
  pin_title TEXT,
  pin_description TEXT,
  hashtags TEXT[],
  pinterest_pin_id TEXT,
  pinterest_pin_url TEXT,
  published_at TIMESTAMPTZ,
  validation_report JSONB,
  skip_reason TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  log JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pap_sched_status_time
  ON public.pinterest_autopilot_schedule (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_pap_sched_product_time
  ON public.pinterest_autopilot_schedule (product_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_pap_sched_date
  ON public.pinterest_autopilot_schedule (scheduled_date);

ALTER TABLE public.pinterest_autopilot_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage autopilot schedule"
  ON public.pinterest_autopilot_schedule FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_pap_sched_updated ON public.pinterest_autopilot_schedule;
CREATE TRIGGER trg_pap_sched_updated
  BEFORE UPDATE ON public.pinterest_autopilot_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_pap_config_updated ON public.pinterest_autopilot_config;
CREATE TRIGGER trg_pap_config_updated
  BEFORE UPDATE ON public.pinterest_autopilot_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

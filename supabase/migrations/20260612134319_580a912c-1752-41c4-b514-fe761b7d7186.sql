
CREATE TABLE public.pinterest_pin_ocr_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id text NOT NULL UNIQUE,
  queue_id uuid,
  image_url text,
  image_hash text,
  ocr_text text,
  ocr_lines jsonb DEFAULT '[]'::jsonb,
  model text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  ocr_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_pin_ocr_cache_status ON public.pinterest_pin_ocr_cache(status);
CREATE INDEX ix_pin_ocr_cache_queue ON public.pinterest_pin_ocr_cache(queue_id);
GRANT SELECT ON public.pinterest_pin_ocr_cache TO authenticated;
GRANT ALL ON public.pinterest_pin_ocr_cache TO service_role;
ALTER TABLE public.pinterest_pin_ocr_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read pin ocr cache" ON public.pinterest_pin_ocr_cache
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pinterest_ocr_cleanup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  trigger text NOT NULL DEFAULT 'manual',
  pins_total int NOT NULL DEFAULT 0,
  pins_already_cached int NOT NULL DEFAULT 0,
  pins_ocr_processed int NOT NULL DEFAULT 0,
  pins_ocr_failed int NOT NULL DEFAULT 0,
  top_phrases jsonb DEFAULT '[]'::jsonb,
  stop_scooping_count int NOT NULL DEFAULT 0,
  stop_scooping_pin_ids jsonb DEFAULT '[]'::jsonb,
  engine_failed boolean NOT NULL DEFAULT false,
  error_message text,
  summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_ocr_runs_started ON public.pinterest_ocr_cleanup_runs(started_at DESC);
GRANT SELECT ON public.pinterest_ocr_cleanup_runs TO authenticated;
GRANT ALL ON public.pinterest_ocr_cleanup_runs TO service_role;
ALTER TABLE public.pinterest_ocr_cleanup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read ocr cleanup runs" ON public.pinterest_ocr_cleanup_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.touch_pin_ocr_cache() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_touch_pin_ocr_cache BEFORE UPDATE ON public.pinterest_pin_ocr_cache
  FOR EACH ROW EXECUTE FUNCTION public.touch_pin_ocr_cache();

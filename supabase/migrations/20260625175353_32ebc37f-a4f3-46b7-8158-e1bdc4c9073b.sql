
CREATE TABLE public.pinterest_metadata_repair_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  total_targets INTEGER NOT NULL DEFAULT 0,
  scanned INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  manual_review INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_metadata_repair_runs TO authenticated;
GRANT ALL ON public.pinterest_metadata_repair_runs TO service_role;
ALTER TABLE public.pinterest_metadata_repair_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read repair runs" ON public.pinterest_metadata_repair_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.pinterest_metadata_repair_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.pinterest_metadata_repair_runs(id) ON DELETE CASCADE,
  pin_id TEXT NOT NULL,
  queue_row_id UUID,
  product_slug TEXT,
  product_id UUID,
  before_title TEXT,
  before_description TEXT,
  before_alt_text TEXT,
  before_link TEXT,
  after_title TEXT,
  after_description TEXT,
  after_alt_text TEXT,
  after_link TEXT,
  mismatch_reasons TEXT[],
  outcome TEXT NOT NULL,
  api_status INTEGER,
  api_error TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  verification_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_metadata_repair_log TO authenticated;
GRANT ALL ON public.pinterest_metadata_repair_log TO service_role;
ALTER TABLE public.pinterest_metadata_repair_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read repair log" ON public.pinterest_metadata_repair_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_repair_log_run ON public.pinterest_metadata_repair_log(run_id);
CREATE INDEX idx_repair_log_pin ON public.pinterest_metadata_repair_log(pin_id);

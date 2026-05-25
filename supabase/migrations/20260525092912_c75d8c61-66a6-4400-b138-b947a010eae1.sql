CREATE TABLE IF NOT EXISTS public.pinterest_verification_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  checked INTEGER NOT NULL DEFAULT 0,
  corrections INTEGER NOT NULL DEFAULT 0,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  triggered_by UUID,
  notes TEXT
);

ALTER TABLE public.pinterest_verification_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view verification runs"
ON public.pinterest_verification_runs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage verification runs"
ON public.pinterest_verification_runs FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.pinterest_publish_verifications
  ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES public.pinterest_verification_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ppv_run_id ON public.pinterest_publish_verifications(run_id);
CREATE INDEX IF NOT EXISTS idx_pvr_started_at ON public.pinterest_verification_runs(started_at DESC);
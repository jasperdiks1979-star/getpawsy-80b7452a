CREATE TABLE public.pinterest_prepublish_gate_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id TEXT NOT NULL,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dry_run BOOLEAN NOT NULL,
  sample_size INTEGER NOT NULL,
  min_score INTEGER NOT NULL,
  avg_native_score NUMERIC,
  draft_count INTEGER NOT NULL DEFAULT 0,
  reject_count INTEGER NOT NULL DEFAULT 0,
  downrank_count INTEGER NOT NULL DEFAULT 0,
  keep_count INTEGER NOT NULL DEFAULT 0,
  applied_rejects INTEGER NOT NULL DEFAULT 0,
  applied_downranks INTEGER NOT NULL DEFAULT 0,
  mix JSONB NOT NULL DEFAULT '{}'::jsonb,
  over_categories JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_pin_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pinterest_prepublish_gate_audit TO authenticated;
GRANT ALL ON public.pinterest_prepublish_gate_audit TO service_role;

ALTER TABLE public.pinterest_prepublish_gate_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read prepublish gate audit"
  ON public.pinterest_prepublish_gate_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_prepublish_gate_audit_ran_at
  ON public.pinterest_prepublish_gate_audit (ran_at DESC);
CREATE INDEX idx_prepublish_gate_audit_trace
  ON public.pinterest_prepublish_gate_audit (trace_id);
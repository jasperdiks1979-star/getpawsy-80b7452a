
CREATE TABLE IF NOT EXISTS public.pinterest_editor_decisions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  product_slug text,
  iteration int NOT NULL DEFAULT 0,
  composite_score int NOT NULL DEFAULT 0,
  axes jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected jsonb NOT NULL DEFAULT '{}'::jsonb,
  feed_impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  improvements jsonb NOT NULL DEFAULT '[]'::jsonb,
  action text NOT NULL DEFAULT 'pending',
  reason text,
  pass_reasons text[] DEFAULT '{}',
  fail_reasons text[] DEFAULT '{}',
  before_snapshot jsonb,
  after_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pinterest_editor_decisions TO authenticated;
GRANT ALL ON public.pinterest_editor_decisions TO service_role;

ALTER TABLE public.pinterest_editor_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read editor decisions"
ON public.pinterest_editor_decisions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages editor decisions"
ON public.pinterest_editor_decisions FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS pinterest_editor_decisions_run_idx
  ON public.pinterest_editor_decisions (run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pinterest_editor_decisions_draft_idx
  ON public.pinterest_editor_decisions (draft_id, iteration DESC);

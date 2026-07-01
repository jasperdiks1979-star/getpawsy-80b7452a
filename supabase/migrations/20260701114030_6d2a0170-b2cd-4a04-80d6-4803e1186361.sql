
-- Genesis V6.4 — Golden DNA Prompt Compiler ledger
CREATE TABLE IF NOT EXISTS public.compiler_prompt_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id TEXT,
  product_id UUID,
  product_slug TEXT,
  rule_hash TEXT NOT NULL,
  compiled_prompt TEXT NOT NULL,
  rule_set JSONB NOT NULL DEFAULT '{}'::jsonb,
  predicted_pre NUMERIC,
  actual_pre NUMERIC,
  dominant_blocker TEXT,
  qa_blockers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  mutation_step INT NOT NULL DEFAULT 0,
  gemini_called BOOLEAN NOT NULL DEFAULT FALSE,
  succeeded BOOLEAN,
  source_function TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.compiler_prompt_ledger TO authenticated;
GRANT ALL ON public.compiler_prompt_ledger TO service_role;

ALTER TABLE public.compiler_prompt_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read compiler ledger"
  ON public.compiler_prompt_ledger
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "service_role manage compiler ledger"
  ON public.compiler_prompt_ledger
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_compiler_ledger_product_created
  ON public.compiler_prompt_ledger (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compiler_ledger_blocker
  ON public.compiler_prompt_ledger (dominant_blocker);
CREATE INDEX IF NOT EXISTS idx_compiler_ledger_trace
  ON public.compiler_prompt_ledger (trace_id);

CREATE OR REPLACE FUNCTION public.tg_compiler_prompt_ledger_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compiler_prompt_ledger_touch ON public.compiler_prompt_ledger;
CREATE TRIGGER trg_compiler_prompt_ledger_touch
  BEFORE UPDATE ON public.compiler_prompt_ledger
  FOR EACH ROW EXECUTE FUNCTION public.tg_compiler_prompt_ledger_touch();

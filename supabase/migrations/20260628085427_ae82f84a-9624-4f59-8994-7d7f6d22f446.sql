-- Governance Decision Ledger (single table, minimum schema)
CREATE TABLE IF NOT EXISTS public.governance_decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  source_engine text NOT NULL,
  decision_type text NOT NULL,
  proposal jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected_metric text,
  expected_value numeric,
  confidence numeric,
  executed_at timestamptz,
  actual_metric text,
  actual_value numeric,
  outcome text,
  roi numeric,
  linked_report text,
  learning_status text NOT NULL DEFAULT 'pending',
  dedupe_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.governance_decision_log TO authenticated;
GRANT ALL ON public.governance_decision_log TO service_role;

ALTER TABLE public.governance_decision_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read governance ledger"
  ON public.governance_decision_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages governance ledger"
  ON public.governance_decision_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_gov_ledger_engine_ts
  ON public.governance_decision_log (source_engine, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_gov_ledger_learning_status
  ON public.governance_decision_log (learning_status);

CREATE OR REPLACE FUNCTION public.gov_ledger_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_gov_ledger_updated_at ON public.governance_decision_log;
CREATE TRIGGER trg_gov_ledger_updated_at
  BEFORE UPDATE ON public.governance_decision_log
  FOR EACH ROW EXECUTE FUNCTION public.gov_ledger_set_updated_at();

-- Atomic record/update helpers (single-table, no duplicates)
CREATE OR REPLACE FUNCTION public.gov_record_decision(
  p_source_engine text,
  p_decision_type text,
  p_proposal jsonb,
  p_expected_metric text DEFAULT NULL,
  p_expected_value numeric DEFAULT NULL,
  p_confidence numeric DEFAULT NULL,
  p_linked_report text DEFAULT NULL,
  p_dedupe_key text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_dedupe_key IS NOT NULL THEN
    SELECT id INTO v_id FROM public.governance_decision_log WHERE dedupe_key = p_dedupe_key;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  INSERT INTO public.governance_decision_log
    (source_engine, decision_type, proposal, expected_metric, expected_value,
     confidence, linked_report, dedupe_key)
  VALUES
    (p_source_engine, p_decision_type, COALESCE(p_proposal,'{}'::jsonb),
     p_expected_metric, p_expected_value, p_confidence, p_linked_report, p_dedupe_key)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.gov_update_outcome(
  p_id uuid,
  p_actual_metric text,
  p_actual_value numeric,
  p_outcome text,
  p_roi numeric DEFAULT NULL,
  p_learning_status text DEFAULT 'evaluated'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.governance_decision_log
     SET actual_metric = p_actual_metric,
         actual_value  = p_actual_value,
         outcome       = p_outcome,
         roi           = p_roi,
         executed_at   = COALESCE(executed_at, now()),
         learning_status = COALESCE(p_learning_status,'evaluated')
   WHERE id = p_id;
END; $$;

REVOKE ALL ON FUNCTION public.gov_record_decision(text,text,jsonb,text,numeric,numeric,text,text) FROM public;
REVOKE ALL ON FUNCTION public.gov_update_outcome(uuid,text,numeric,text,numeric,text) FROM public;
GRANT EXECUTE ON FUNCTION public.gov_record_decision(text,text,jsonb,text,numeric,numeric,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gov_update_outcome(uuid,text,numeric,text,numeric,text) TO authenticated, service_role;
-- Phase 1: Evidence Source Architecture (soft rollout, no CHECK constraints yet)
-- Add nullable evidence_source columns + observability views. Do NOT touch PCIE2 core,
-- Guardian, publishers, queues, tracking, checkout.

ALTER TABLE public.pcie2_xai_decisions
  ADD COLUMN IF NOT EXISTS evidence_source text;

ALTER TABLE public.ede_proposals
  ADD COLUMN IF NOT EXISTS evidence_source text;

ALTER TABLE public.aec_advisor_votes
  ADD COLUMN IF NOT EXISTS evidence_source text;

ALTER TABLE public.aec_decisions
  ADD COLUMN IF NOT EXISTS evidence_source text,
  ADD COLUMN IF NOT EXISTS evidence_source_gate text,
  ADD COLUMN IF NOT EXISTS evidence_source_gate_reason text;

CREATE INDEX IF NOT EXISTS pcie2_xai_decisions_evsrc_idx
  ON public.pcie2_xai_decisions (evidence_source, created_at DESC);

CREATE INDEX IF NOT EXISTS aec_advisor_votes_evsrc_idx
  ON public.aec_advisor_votes (evidence_source);

CREATE INDEX IF NOT EXISTS ede_proposals_evsrc_idx
  ON public.ede_proposals (evidence_source);

-- Observability view: untagged emissions per engine per day (drives phase-2 constraint decision)
CREATE OR REPLACE VIEW public.xai_evidence_source_coverage_7d AS
SELECT
  date_trunc('day', created_at)::date AS day,
  source_engine,
  count(*)                                                       AS total,
  count(*) FILTER (WHERE evidence_source IS NOT NULL)            AS tagged,
  count(*) FILTER (WHERE evidence_source IS NULL)                AS untagged,
  count(*) FILTER (WHERE evidence_source = 'organic')            AS organic,
  count(*) FILTER (WHERE evidence_source = 'paid')               AS paid,
  count(*) FILTER (WHERE evidence_source = 'blended')            AS blended,
  count(*) FILTER (WHERE evidence_source = 'heuristic')          AS heuristic,
  count(*) FILTER (WHERE evidence_source = 'insufficient_data')  AS insufficient_data,
  round(
    100.0 * count(*) FILTER (WHERE evidence_source IS NOT NULL) / NULLIF(count(*), 0),
    2
  ) AS tagged_pct
FROM public.pcie2_xai_decisions
WHERE created_at > now() - interval '7 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

GRANT SELECT ON public.xai_evidence_source_coverage_7d TO authenticated;
GRANT SELECT ON public.xai_evidence_source_coverage_7d TO service_role;

-- Council gate audit log (soft): records how many advisor votes were downgraded/blocked by evidence_source
CREATE TABLE IF NOT EXISTS public.aec_evidence_source_gate_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  council_run_id      uuid,
  decision_type       text,
  subject             text,
  top_evidence_source text,
  action              text NOT NULL,   -- 'allow' | 'validate_only' | 'block' | 'flag_missing'
  reason              text,
  advisor_count       integer,
  organic_votes       integer,
  paid_votes          integer,
  blended_votes       integer,
  heuristic_votes     integer,
  insufficient_votes  integer,
  untagged_votes      integer,
  created_at          timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.aec_evidence_source_gate_log TO authenticated;
GRANT ALL    ON public.aec_evidence_source_gate_log TO service_role;

ALTER TABLE public.aec_evidence_source_gate_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aec_evsrc_gate_admin_read"
  ON public.aec_evidence_source_gate_log
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS aec_evsrc_gate_log_created_idx
  ON public.aec_evidence_source_gate_log (created_at DESC);
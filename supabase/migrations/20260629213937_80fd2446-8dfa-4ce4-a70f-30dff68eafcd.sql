
CREATE TABLE IF NOT EXISTS public.tsi_session_enrichment (
  session_id TEXT PRIMARY KEY,
  original_source TEXT,
  original_medium TEXT,
  recovered_source TEXT NOT NULL,
  classification TEXT NOT NULL,
  bucket TEXT NOT NULL,
  confidence NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_recovered BOOLEAN NOT NULL DEFAULT false,
  is_bot BOOLEAN NOT NULL DEFAULT false,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  classified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tsi_enrich_bucket_idx ON public.tsi_session_enrichment(bucket);
CREATE INDEX IF NOT EXISTS tsi_enrich_classification_idx ON public.tsi_session_enrichment(classification);
CREATE INDEX IF NOT EXISTS tsi_enrich_classified_at_idx ON public.tsi_session_enrichment(classified_at DESC);

GRANT SELECT ON public.tsi_session_enrichment TO authenticated;
GRANT ALL ON public.tsi_session_enrichment TO service_role;

ALTER TABLE public.tsi_session_enrichment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read tsi enrichment"
  ON public.tsi_session_enrichment FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role writes tsi enrichment"
  ON public.tsi_session_enrichment FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

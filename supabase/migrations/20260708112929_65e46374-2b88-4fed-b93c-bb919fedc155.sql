
CREATE TABLE public.pinterest_resurrection_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_queue_id UUID,
  product_id UUID NOT NULL,
  product_slug TEXT NOT NULL,
  bucket TEXT NOT NULL,
  proposed_title TEXT NOT NULL,
  proposed_description TEXT,
  proposed_image_brief JSONB,
  proposed_board_id BIGINT,
  proposed_board_name TEXT,
  us_audience_score NUMERIC,
  duplicate_risk NUMERIC,
  banned_phrase_hit TEXT,
  confidence_score NUMERIC,
  ctr_prediction NUMERIC,
  revenue_prediction NUMERIC,
  status TEXT NOT NULL DEFAULT 'draft',
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prc_product_slug ON public.pinterest_resurrection_candidates(product_slug);
CREATE INDEX idx_prc_status ON public.pinterest_resurrection_candidates(status);
CREATE INDEX idx_prc_bucket ON public.pinterest_resurrection_candidates(bucket);
CREATE INDEX idx_prc_confidence ON public.pinterest_resurrection_candidates(confidence_score DESC);
CREATE INDEX idx_prc_batch ON public.pinterest_resurrection_candidates(batch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_resurrection_candidates TO authenticated;
GRANT ALL ON public.pinterest_resurrection_candidates TO service_role;

ALTER TABLE public.pinterest_resurrection_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view resurrection candidates"
  ON public.pinterest_resurrection_candidates FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert resurrection candidates"
  ON public.pinterest_resurrection_candidates FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update resurrection candidates"
  ON public.pinterest_resurrection_candidates FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete resurrection candidates"
  ON public.pinterest_resurrection_candidates FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.tg_prc_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_prc_updated_at
  BEFORE UPDATE ON public.pinterest_resurrection_candidates
  FOR EACH ROW EXECUTE FUNCTION public.tg_prc_updated_at();

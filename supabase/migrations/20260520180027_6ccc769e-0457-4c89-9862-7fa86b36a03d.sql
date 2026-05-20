CREATE TABLE IF NOT EXISTS public.growth_creative_dna (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gene_type text NOT NULL CHECK (gene_type IN ('hook','angle','backdrop')),
  gene_value text NOT NULL,
  parent_id uuid REFERENCES public.growth_creative_dna(id) ON DELETE SET NULL,
  generation integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'testing' CHECK (status IN ('active','testing','retired')),
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  reward numeric NOT NULL DEFAULT 0,
  ewma_reward numeric NOT NULL DEFAULT 0,
  sample_size integer NOT NULL DEFAULT 0,
  last_test_at timestamptz,
  retired_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gene_type, gene_value)
);

CREATE INDEX IF NOT EXISTS idx_dna_type_status ON public.growth_creative_dna (gene_type, status);
CREATE INDEX IF NOT EXISTS idx_dna_ewma ON public.growth_creative_dna (gene_type, ewma_reward DESC);

ALTER TABLE public.growth_creative_dna ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage creative dna"
ON public.growth_creative_dna
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.touch_growth_creative_dna()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_creative_dna ON public.growth_creative_dna;
CREATE TRIGGER trg_touch_creative_dna
BEFORE UPDATE ON public.growth_creative_dna
FOR EACH ROW EXECUTE FUNCTION public.touch_growth_creative_dna();
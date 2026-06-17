
CREATE TABLE IF NOT EXISTS public.product_winner_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  run_id UUID NOT NULL,
  revenue_probability NUMERIC(5,2) NOT NULL DEFAULT 0,
  pinterest_click_probability NUMERIC(5,2) NOT NULL DEFAULT 0,
  conversion_probability NUMERIC(5,2) NOT NULL DEFAULT 0,
  impulse_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  perceived_value_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  bestseller_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  first_sale_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  estimated_profit_per_sale NUMERIC(10,2) NOT NULL DEFAULT 0,
  competition_level TEXT NOT NULL DEFAULT 'medium',
  verdict TEXT NOT NULL DEFAULT 'hold',
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.product_winner_scores TO authenticated;
GRANT ALL ON public.product_winner_scores TO service_role;
ALTER TABLE public.product_winner_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read winner scores" ON public.product_winner_scores
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS idx_pws_run ON public.product_winner_scores(run_id);
CREATE INDEX IF NOT EXISTS idx_pws_product ON public.product_winner_scores(product_id, created_at DESC);

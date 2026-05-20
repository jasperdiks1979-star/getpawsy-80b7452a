
CREATE TABLE IF NOT EXISTS public.market_product_priority (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT CURRENT_DATE,
  rank integer NOT NULL,
  composite_score numeric NOT NULL DEFAULT 0,
  recommended_channels text[] NOT NULL DEFAULT '{}',
  rationale text,
  factors jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, day)
);

ALTER TABLE public.market_product_priority ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_market_product_priority"
  ON public.market_product_priority FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_market_priority_day
  ON public.market_product_priority (day DESC, rank ASC);

CREATE TRIGGER trg_market_product_priority_updated
  BEFORE UPDATE ON public.market_product_priority
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

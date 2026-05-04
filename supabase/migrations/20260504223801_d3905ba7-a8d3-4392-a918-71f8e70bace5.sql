
CREATE TABLE IF NOT EXISTS public.profit_engine_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id text NOT NULL,
  product_id text,
  verdict text NOT NULL,
  reason text NOT NULL,
  ctr numeric(6,4) NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  cpc numeric(10,4),
  break_even_cpc numeric(10,4),
  margin_usd numeric(10,2),
  recommended_budget_delta_pct integer NOT NULL DEFAULT 0,
  applied boolean NOT NULL DEFAULT false,
  decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profit_decisions_pin ON public.profit_engine_decisions (pin_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_profit_decisions_verdict ON public.profit_engine_decisions (verdict, decided_at DESC);

ALTER TABLE public.profit_engine_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read profit decisions"
  ON public.profit_engine_decisions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages profit decisions"
  ON public.profit_engine_decisions FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS profit_state text;

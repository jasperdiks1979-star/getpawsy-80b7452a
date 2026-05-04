
-- Profit Engine settings (single-row config)
CREATE TABLE IF NOT EXISTS public.profit_engine_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  blended_margin_pct numeric(5,2) NOT NULL DEFAULT 35.00,
  target_roas numeric(5,2) NOT NULL DEFAULT 2.00,
  min_impressions_kill integer NOT NULL DEFAULT 500,
  ctr_kill_pct numeric(5,2) NOT NULL DEFAULT 1.00,
  ctr_scale_pct numeric(5,2) NOT NULL DEFAULT 2.00,
  scale_budget_pct integer NOT NULL DEFAULT 75,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profit_engine_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage profit engine settings"
  ON public.profit_engine_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages profit engine settings"
  ON public.profit_engine_settings
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER update_profit_engine_settings_updated_at
  BEFORE UPDATE ON public.profit_engine_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.profit_engine_settings (singleton) VALUES (true)
  ON CONFLICT (singleton) DO NOTHING;

-- Optional paid-ad spend entries (manual / CSV paste, per pin per day)
CREATE TABLE IF NOT EXISTS public.ad_spend_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  platform text NOT NULL DEFAULT 'pinterest',
  pin_id text,
  product_id text,
  campaign text,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  spend numeric(10,2) NOT NULL DEFAULT 0,
  add_to_cart integer NOT NULL DEFAULT 0,
  purchases integer NOT NULL DEFAULT 0,
  revenue numeric(10,2) NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_entries_pin ON public.ad_spend_entries (pin_id);
CREATE INDEX IF NOT EXISTS idx_ad_spend_entries_date ON public.ad_spend_entries (entry_date DESC);

ALTER TABLE public.ad_spend_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ad spend entries"
  ON public.ad_spend_entries
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role manages ad spend entries"
  ON public.ad_spend_entries
  FOR ALL
  USING (auth.role() = 'service_role');

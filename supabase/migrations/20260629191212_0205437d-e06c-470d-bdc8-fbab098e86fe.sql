
CREATE TABLE IF NOT EXISTS public.gv3_pin_growth_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'queued',
  window_days int NOT NULL DEFAULT 30,
  products_analyzed int NOT NULL DEFAULT 0,
  products_promoted int NOT NULL DEFAULT 0,
  recommendations_written int NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gv3_pin_growth_runs TO authenticated;
GRANT ALL ON public.gv3_pin_growth_runs TO service_role;
ALTER TABLE public.gv3_pin_growth_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gv3_pin_growth_runs admin read" ON public.gv3_pin_growth_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gv3_pin_growth_scores (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.gv3_pin_growth_runs(id) ON DELETE SET NULL,
  pinterest_growth_score numeric NOT NULL DEFAULT 0,
  classification text,
  reason text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  predicted_opportunity numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  pinterest_saturation int NOT NULL DEFAULT 0,
  last_scored_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gv3_pin_growth_scores TO authenticated;
GRANT ALL ON public.gv3_pin_growth_scores TO service_role;
ALTER TABLE public.gv3_pin_growth_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gv3_pin_growth_scores admin read" ON public.gv3_pin_growth_scores FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX IF NOT EXISTS idx_gv3_pgs_score ON public.gv3_pin_growth_scores(pinterest_growth_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_gv3_pgs_class ON public.gv3_pin_growth_scores(classification);

CREATE TABLE IF NOT EXISTS public.gv3_pin_growth_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.gv3_pin_growth_runs(id) ON DELETE SET NULL,
  classification text NOT NULL,
  recommended_action text NOT NULL,
  reason text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_strategy jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority int NOT NULL DEFAULT 5,
  expected_impact text,
  confidence numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gv3_pin_growth_recommendations TO authenticated;
GRANT ALL ON public.gv3_pin_growth_recommendations TO service_role;
ALTER TABLE public.gv3_pin_growth_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gv3_pin_growth_recs admin read" ON public.gv3_pin_growth_recommendations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_gv3_pgr_run_product ON public.gv3_pin_growth_recommendations(run_id, product_id);
CREATE INDEX IF NOT EXISTS idx_gv3_pgr_priority ON public.gv3_pin_growth_recommendations(priority DESC);

CREATE TRIGGER trg_gv3_pgs_updated BEFORE UPDATE ON public.gv3_pin_growth_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Crons
DO $$ BEGIN
  PERFORM cron.unschedule('product-intelligence-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('pinterest-growth-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'product-intelligence-daily',
  '20 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/product-intelligence-run?trigger=cron',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'pinterest-growth-daily',
  '40 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/pinterest-growth-run?trigger=cron',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb
  );
  $$
);

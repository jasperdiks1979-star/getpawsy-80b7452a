
CREATE TABLE public.genesis_omega_syntheses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  run_id uuid REFERENCES public.ai_ceo_runs(id) ON DELETE SET NULL,
  ceo_view jsonb NOT NULL DEFAULT '{}'::jsonb,
  cfo_view jsonb NOT NULL DEFAULT '{}'::jsonb,
  coo_view jsonb NOT NULL DEFAULT '{}'::jsonb,
  cto_view jsonb NOT NULL DEFAULT '{}'::jsonb,
  cmo_view jsonb NOT NULL DEFAULT '{}'::jsonb,
  synthesis text NOT NULL DEFAULT '',
  disagreements jsonb NOT NULL DEFAULT '[]'::jsonb,
  overall_score numeric NOT NULL DEFAULT 0,
  model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.genesis_omega_syntheses TO authenticated;
GRANT ALL ON public.genesis_omega_syntheses TO service_role;
ALTER TABLE public.genesis_omega_syntheses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read omega syntheses" ON public.genesis_omega_syntheses
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service writes omega syntheses" ON public.genesis_omega_syntheses
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_omega_syntheses_created ON public.genesis_omega_syntheses (created_at DESC);

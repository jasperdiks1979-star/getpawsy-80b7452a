
CREATE TABLE IF NOT EXISTS public.channel_intelligence_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  channel_key text NOT NULL,
  channel_label text NOT NULL,
  available boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'UNKNOWN',
  status_reason text,
  priority text,
  visitors_30d integer NOT NULL DEFAULT 0,
  purchases_30d integer NOT NULL DEFAULT 0,
  revenue_30d_usd numeric(14,2) NOT NULL DEFAULT 0,
  visitor_share numeric(6,4) NOT NULL DEFAULT 0,
  revenue_share numeric(6,4) NOT NULL DEFAULT 0,
  purchase_share numeric(6,4) NOT NULL DEFAULT 0,
  conversion_rate numeric(6,4) NOT NULL DEFAULT 0,
  health_score integer NOT NULL DEFAULT 0,
  trust_score integer NOT NULL DEFAULT 0,
  dependency_score integer NOT NULL DEFAULT 0,
  spof_score integer NOT NULL DEFAULT 0,
  recovery_difficulty integer NOT NULL DEFAULT 50,
  third_party_dependency text,
  api_status text,
  owner text,
  confidence numeric(4,3) NOT NULL DEFAULT 0.9,
  notes text
);
CREATE INDEX IF NOT EXISTS cis_captured_idx ON public.channel_intelligence_snapshots(captured_at DESC);
CREATE INDEX IF NOT EXISTS cis_channel_idx ON public.channel_intelligence_snapshots(channel_key, captured_at DESC);
GRANT SELECT ON public.channel_intelligence_snapshots TO authenticated;
GRANT ALL ON public.channel_intelligence_snapshots TO service_role;
ALTER TABLE public.channel_intelligence_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cis admin read" ON public.channel_intelligence_snapshots FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.channel_survival_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulated_at timestamptz NOT NULL DEFAULT now(),
  scenario text NOT NULL,
  channel_key text,
  expected_revenue_loss_usd numeric(14,2) NOT NULL DEFAULT 0,
  expected_revenue_loss_pct numeric(6,4) NOT NULL DEFAULT 0,
  business_health_loss integer NOT NULL DEFAULT 0,
  operational_impact text,
  recovery_time_days integer,
  best_alternative text,
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric(4,3) NOT NULL DEFAULT 0.8
);
CREATE INDEX IF NOT EXISTS css_simulated_idx ON public.channel_survival_simulations(simulated_at DESC);
GRANT SELECT ON public.channel_survival_simulations TO authenticated;
GRANT ALL ON public.channel_survival_simulations TO service_role;
ALTER TABLE public.channel_survival_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "css admin read" ON public.channel_survival_simulations FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.channel_intelligence_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_at timestamptz NOT NULL DEFAULT now(),
  diversification_score integer NOT NULL DEFAULT 0,
  top_spof_channel text,
  top_spof_revenue_pct numeric(6,4) NOT NULL DEFAULT 0,
  active_channels integer NOT NULL DEFAULT 0,
  unavailable_channels integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  top_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  sha256 text NOT NULL,
  markdown text
);
CREATE INDEX IF NOT EXISTS cir_generated_idx ON public.channel_intelligence_reports(generated_at DESC);
GRANT SELECT ON public.channel_intelligence_reports TO authenticated;
GRANT ALL ON public.channel_intelligence_reports TO service_role;
ALTER TABLE public.channel_intelligence_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cir admin read" ON public.channel_intelligence_reports FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

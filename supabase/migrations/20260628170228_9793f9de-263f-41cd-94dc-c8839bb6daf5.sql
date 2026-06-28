
CREATE TABLE IF NOT EXISTS public.pinterest_market_opportunities (
  id uuid primary key default gen_random_uuid(),
  signal_key text not null,
  signal_kind text not null,
  niche text,
  lifecycle text not null check (lifecycle in ('emerging','growing','peak','declining','expired','evergreen','seasonal')),
  opportunity_score numeric not null default 0,
  growth_velocity numeric,
  competition_index numeric,
  saturation numeric,
  seasonality numeric,
  commercial_intent numeric,
  confidence numeric not null default 0,
  expected_reach integer,
  expected_revenue_cents integer,
  recommended_action text,
  rationale text,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (signal_key, signal_kind)
);
GRANT SELECT ON public.pinterest_market_opportunities TO authenticated;
GRANT ALL ON public.pinterest_market_opportunities TO service_role;
ALTER TABLE public.pinterest_market_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read market opportunities" ON public.pinterest_market_opportunities
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role manages market opportunities" ON public.pinterest_market_opportunities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.pinterest_market_intel_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  signals_seen integer default 0,
  opportunities_new integer default 0,
  opportunities_updated integer default 0,
  opportunities_expired integer default 0,
  xai_emitted integer default 0,
  market_score integer,
  competition_index numeric,
  notes jsonb default '{}'::jsonb
);
GRANT SELECT ON public.pinterest_market_intel_runs TO authenticated;
GRANT ALL ON public.pinterest_market_intel_runs TO service_role;
ALTER TABLE public.pinterest_market_intel_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read market runs" ON public.pinterest_market_intel_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role manages market runs" ON public.pinterest_market_intel_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS pinterest_market_opp_lifecycle_idx
  ON public.pinterest_market_opportunities (lifecycle, opportunity_score DESC);
CREATE INDEX IF NOT EXISTS pinterest_market_opp_status_idx
  ON public.pinterest_market_opportunities (status, updated_at DESC);

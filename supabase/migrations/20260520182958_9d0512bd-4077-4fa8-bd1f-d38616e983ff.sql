
-- Phase 8c: Trend clustering + Creative DNA cross-pollination

CREATE TABLE IF NOT EXISTS public.market_trend_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_key text NOT NULL,
  source text NOT NULL,
  label text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  signal_score numeric NOT NULL DEFAULT 0,
  velocity numeric NOT NULL DEFAULT 0,
  sample_size integer NOT NULL DEFAULT 0,
  examples jsonb NOT NULL DEFAULT '[]',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'emerging' CHECK (status IN ('emerging','rising','peaked','declining','archived')),
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cluster_key, source)
);

ALTER TABLE public.market_trend_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_market_trend_clusters"
  ON public.market_trend_clusters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_trend_clusters_score
  ON public.market_trend_clusters (source, signal_score DESC);
CREATE INDEX IF NOT EXISTS idx_trend_clusters_status
  ON public.market_trend_clusters (status, last_seen_at DESC);

CREATE TRIGGER trg_market_trend_clusters_updated
  BEFORE UPDATE ON public.market_trend_clusters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- DNA promotion ledger: which clusters seeded which genes
CREATE TABLE IF NOT EXISTS public.market_dna_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id uuid REFERENCES public.market_trend_clusters(id) ON DELETE SET NULL,
  gene_id uuid REFERENCES public.growth_creative_dna(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.market_dna_promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_all_market_dna_promotions"
  ON public.market_dna_promotions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));


CREATE TABLE public.genesis_genome_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  node_count integer NOT NULL DEFAULT 0,
  edge_count integer NOT NULL DEFAULT 0,
  completeness numeric NOT NULL DEFAULT 0,
  health_score numeric NOT NULL DEFAULT 0,
  rooms jsonb NOT NULL DEFAULT '{}'::jsonb,
  nodes jsonb NOT NULL DEFAULT '[]'::jsonb,
  edges jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text NOT NULL DEFAULT ''
);
GRANT SELECT ON public.genesis_genome_snapshots TO authenticated;
GRANT ALL ON public.genesis_genome_snapshots TO service_role;
ALTER TABLE public.genesis_genome_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read genome snapshots" ON public.genesis_genome_snapshots
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service writes genome snapshots" ON public.genesis_genome_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_genome_snapshots_created ON public.genesis_genome_snapshots (created_at DESC);

CREATE TABLE public.genesis_genome_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.genesis_genome_snapshots(id) ON DELETE CASCADE,
  node_key text NOT NULL,
  kind text NOT NULL,
  room text NOT NULL,
  label text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_genome_nodes TO authenticated;
GRANT ALL ON public.genesis_genome_nodes TO service_role;
ALTER TABLE public.genesis_genome_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read genome nodes" ON public.genesis_genome_nodes
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service writes genome nodes" ON public.genesis_genome_nodes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_genome_nodes_snapshot ON public.genesis_genome_nodes (snapshot_id);
CREATE INDEX idx_genome_nodes_kind ON public.genesis_genome_nodes (kind);
CREATE INDEX idx_genome_nodes_room ON public.genesis_genome_nodes (room);
CREATE INDEX idx_genome_nodes_label_trgm ON public.genesis_genome_nodes USING gin (label gin_trgm_ops);

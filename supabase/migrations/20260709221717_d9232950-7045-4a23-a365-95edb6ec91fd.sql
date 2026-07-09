
-- =========================================================
-- Pinterest Evolution Engine — closed learning loop tables
-- Additive; never overwrites existing certified pipeline.
-- =========================================================

-- 1) Versioned engine snapshots ----------------------------
CREATE TABLE public.pinterest_evolution_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL,
  notes text,
  pins_analyzed integer NOT NULL DEFAULT 0,
  attributes_learned integer NOT NULL DEFAULT 0,
  first_pass_certification_rate numeric,
  recovery_success_rate numeric,
  organic_saves_per_pin numeric,
  organic_clicks_per_pin numeric,
  organic_purchases_per_pin numeric,
  organic_revenue_per_pin numeric,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pinterest_evolution_versions_version_key
  ON public.pinterest_evolution_versions(version);

GRANT SELECT ON public.pinterest_evolution_versions TO authenticated;
GRANT ALL    ON public.pinterest_evolution_versions TO service_role;
ALTER TABLE public.pinterest_evolution_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read evolution versions"
  ON public.pinterest_evolution_versions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "service writes evolution versions"
  ON public.pinterest_evolution_versions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2) Per-attribute effect snapshots ------------------------
CREATE TABLE public.pinterest_evolution_attribute_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid REFERENCES public.pinterest_evolution_versions(id) ON DELETE CASCADE,
  attribute text NOT NULL,
  value text NOT NULL,
  metric text NOT NULL,
  effect numeric NOT NULL,
  sample_size integer NOT NULL,
  cohort_size integer,
  baseline numeric,
  confidence numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pee_attr_metric_idx
  ON public.pinterest_evolution_attribute_effects(attribute, metric);
CREATE INDEX pee_version_idx
  ON public.pinterest_evolution_attribute_effects(version_id);
CREATE INDEX pee_created_idx
  ON public.pinterest_evolution_attribute_effects(created_at DESC);

GRANT SELECT ON public.pinterest_evolution_attribute_effects TO authenticated;
GRANT ALL    ON public.pinterest_evolution_attribute_effects TO service_role;
ALTER TABLE public.pinterest_evolution_attribute_effects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read evolution effects"
  ON public.pinterest_evolution_attribute_effects FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "service writes evolution effects"
  ON public.pinterest_evolution_attribute_effects FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3) Permanent winners memory ------------------------------
CREATE TABLE public.pinterest_evolution_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  key text NOT NULL,
  wins integer NOT NULL DEFAULT 0,
  organic_saves numeric NOT NULL DEFAULT 0,
  organic_clicks numeric NOT NULL DEFAULT 0,
  organic_purchases numeric NOT NULL DEFAULT 0,
  organic_revenue numeric NOT NULL DEFAULT 0,
  sample_size integer NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_updated timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pem_kind_key_uidx
  ON public.pinterest_evolution_memory(kind, key);

GRANT SELECT ON public.pinterest_evolution_memory TO authenticated;
GRANT ALL    ON public.pinterest_evolution_memory TO service_role;
ALTER TABLE public.pinterest_evolution_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read evolution memory"
  ON public.pinterest_evolution_memory FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "service writes evolution memory"
  ON public.pinterest_evolution_memory FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4) Active recommendations for next-generation creatives -
CREATE TABLE public.pinterest_evolution_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid REFERENCES public.pinterest_evolution_versions(id) ON DELETE CASCADE,
  directive text NOT NULL,
  reason text NOT NULL,
  metric text NOT NULL,
  effect numeric NOT NULL,
  confidence numeric NOT NULL,
  sample_size integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX per_active_priority_idx
  ON public.pinterest_evolution_recommendations(active, priority);
CREATE INDEX per_version_idx
  ON public.pinterest_evolution_recommendations(version_id);

GRANT SELECT ON public.pinterest_evolution_recommendations TO authenticated;
GRANT ALL    ON public.pinterest_evolution_recommendations TO service_role;
ALTER TABLE public.pinterest_evolution_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read evolution recs"
  ON public.pinterest_evolution_recommendations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "service writes evolution recs"
  ON public.pinterest_evolution_recommendations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5) Engine runs ------------------------------------------
CREATE TABLE public.pinterest_evolution_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid REFERENCES public.pinterest_evolution_versions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running',
  pins_analyzed integer NOT NULL DEFAULT 0,
  attributes_learned integer NOT NULL DEFAULT 0,
  recommendations_written integer NOT NULL DEFAULT 0,
  memory_updated integer NOT NULL DEFAULT 0,
  duration_ms integer,
  error text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX per_runs_started_idx
  ON public.pinterest_evolution_runs(started_at DESC);

GRANT SELECT ON public.pinterest_evolution_runs TO authenticated;
GRANT ALL    ON public.pinterest_evolution_runs TO service_role;
ALTER TABLE public.pinterest_evolution_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read evolution runs"
  ON public.pinterest_evolution_runs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "service writes evolution runs"
  ON public.pinterest_evolution_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

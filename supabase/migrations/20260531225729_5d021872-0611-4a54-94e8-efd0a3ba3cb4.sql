
ALTER TABLE public.cinematic_ad_jobs
  ADD COLUMN IF NOT EXISTS director_archetype text,
  ADD COLUMN IF NOT EXISTS director_run_id uuid;

CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_director_run ON public.cinematic_ad_jobs(director_run_id);
CREATE INDEX IF NOT EXISTS idx_cinematic_ad_jobs_director_archetype ON public.cinematic_ad_jobs(director_archetype);

CREATE TABLE IF NOT EXISTS public.director_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL,
  category text,
  winner_job_id uuid,
  winner_archetype text,
  decided_reasoning text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.director_runs TO authenticated;
GRANT ALL ON public.director_runs TO service_role;
ALTER TABLE public.director_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read director_runs" ON public.director_runs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service writes director_runs" ON public.director_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.director_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.director_runs(id) ON DELETE CASCADE,
  job_id uuid,
  archetype text NOT NULL,
  product_slug text NOT NULL,
  category text,
  predicted_score numeric,
  pinterest_quality_score numeric,
  motion_score numeric,
  commercial_score numeric,
  ctr_pred_score numeric,
  engagement_pred_score numeric,
  composite_score numeric,
  impressions integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  outbound_clicks integer NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  engagement_rate numeric NOT NULL DEFAULT 0,
  is_winner boolean NOT NULL DEFAULT false,
  metrics_collected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_director_concepts_run ON public.director_concepts(run_id);
CREATE INDEX IF NOT EXISTS idx_director_concepts_job ON public.director_concepts(job_id);
CREATE INDEX IF NOT EXISTS idx_director_concepts_archetype ON public.director_concepts(archetype);
GRANT SELECT ON public.director_concepts TO authenticated;
GRANT ALL ON public.director_concepts TO service_role;
ALTER TABLE public.director_concepts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read director_concepts" ON public.director_concepts FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service writes director_concepts" ON public.director_concepts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.director_archetype_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archetype text NOT NULL,
  category text NOT NULL DEFAULT '*',
  weight numeric NOT NULL DEFAULT 1.0,
  samples integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  total_impressions integer NOT NULL DEFAULT 0,
  total_saves integer NOT NULL DEFAULT 0,
  total_clicks integer NOT NULL DEFAULT 0,
  avg_ctr numeric NOT NULL DEFAULT 0,
  avg_engagement_rate numeric NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now(),
  UNIQUE(archetype, category)
);
GRANT SELECT ON public.director_archetype_weights TO authenticated;
GRANT ALL ON public.director_archetype_weights TO service_role;
ALTER TABLE public.director_archetype_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read weights" ON public.director_archetype_weights FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service writes weights" ON public.director_archetype_weights FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed default weights for the 4 archetypes (category-agnostic baseline)
INSERT INTO public.director_archetype_weights (archetype, category, weight) VALUES
  ('problem_solution', '*', 1.0),
  ('emotional',        '*', 1.0),
  ('premium_lifestyle','*', 1.0),
  ('viral_interrupt',  '*', 1.0)
ON CONFLICT (archetype, category) DO NOTHING;

CREATE TRIGGER director_runs_updated BEFORE UPDATE ON public.director_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER director_concepts_updated BEFORE UPDATE ON public.director_concepts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

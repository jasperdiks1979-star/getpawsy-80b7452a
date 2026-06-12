
CREATE TABLE public.pinterest_diversity_cleanup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  protection_run_id uuid,
  pins_scanned int NOT NULL DEFAULT 0,
  pins_archived int NOT NULL DEFAULT 0,
  pins_replaced int NOT NULL DEFAULT 0,
  pins_kept int NOT NULL DEFAULT 0,
  pins_review int NOT NULL DEFAULT 0,
  replacement_drafts int NOT NULL DEFAULT 0,
  impressions_removed bigint NOT NULL DEFAULT 0,
  impressions_preserved bigint NOT NULL DEFAULT 0,
  diversity_score_before numeric,
  diversity_score_after numeric,
  overused_overlays jsonb NOT NULL DEFAULT '[]'::jsonb,
  banned_phrase_hits jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_diversity_cleanup_runs TO authenticated;
GRANT ALL ON public.pinterest_diversity_cleanup_runs TO service_role;
ALTER TABLE public.pinterest_diversity_cleanup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read diversity cleanup runs" ON public.pinterest_diversity_cleanup_runs
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.pinterest_diversity_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.pinterest_diversity_cleanup_runs(id) ON DELETE CASCADE,
  dimension text NOT NULL,
  dimension_value text NOT NULL,
  pin_count int NOT NULL DEFAULT 0,
  unique_overlay_count int NOT NULL DEFAULT 0,
  diversity_score numeric NOT NULL DEFAULT 0,
  top_overlay text,
  top_overlay_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_diversity_scores_run ON public.pinterest_diversity_scores(run_id);
CREATE INDEX ix_diversity_scores_dim ON public.pinterest_diversity_scores(dimension, dimension_value);
GRANT SELECT ON public.pinterest_diversity_scores TO authenticated;
GRANT ALL ON public.pinterest_diversity_scores TO service_role;
ALTER TABLE public.pinterest_diversity_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read diversity scores" ON public.pinterest_diversity_scores
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.pinterest_overlay_replacement_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.pinterest_diversity_cleanup_runs(id) ON DELETE SET NULL,
  legacy_queue_id uuid,
  legacy_pinterest_pin_id text,
  legacy_overlay text,
  product_slug text,
  board_name text,
  replacement_count int NOT NULL DEFAULT 0,
  replacement_draft_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending_replacement',
  indexed_replacement_count int NOT NULL DEFAULT 0,
  archived_at timestamptz,
  last_checked_at timestamptz,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_overlay_repl_status ON public.pinterest_overlay_replacement_jobs(status);
CREATE INDEX ix_overlay_repl_run ON public.pinterest_overlay_replacement_jobs(run_id);
GRANT SELECT ON public.pinterest_overlay_replacement_jobs TO authenticated;
GRANT ALL ON public.pinterest_overlay_replacement_jobs TO service_role;
ALTER TABLE public.pinterest_overlay_replacement_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read overlay replacement jobs" ON public.pinterest_overlay_replacement_jobs
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_touch_overlay_repl
  BEFORE UPDATE ON public.pinterest_overlay_replacement_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

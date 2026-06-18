
CREATE TABLE public.cv5_video_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storyboard_id uuid NOT NULL REFERENCES public.cv5_storyboards(id) ON DELETE CASCADE,
  pin_id text,
  product_id text,
  impressions integer NOT NULL DEFAULT 0,
  outbound_clicks integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  video_views integer NOT NULL DEFAULT 0,
  total_watch_time_s numeric NOT NULL DEFAULT 0,
  avg_watch_time_s numeric NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  save_rate numeric NOT NULL DEFAULT 0,
  completion_rate numeric NOT NULL DEFAULT 0,
  composite_score numeric NOT NULL DEFAULT 0,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storyboard_id, pin_id)
);
CREATE INDEX cv5_video_analytics_storyboard_idx ON public.cv5_video_analytics(storyboard_id);
CREATE INDEX cv5_video_analytics_score_idx ON public.cv5_video_analytics(composite_score DESC);

GRANT SELECT ON public.cv5_video_analytics TO authenticated;
GRANT ALL ON public.cv5_video_analytics TO service_role;
ALTER TABLE public.cv5_video_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read v5 analytics" ON public.cv5_video_analytics FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role v5 analytics" ON public.cv5_video_analytics FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.cv5_winning_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type text NOT NULL CHECK (pattern_type IN ('hook','benefit','cta','scene_structure')),
  niche text,
  pattern_key text NOT NULL,
  pattern_text text NOT NULL,
  sample_size integer NOT NULL DEFAULT 0,
  avg_ctr numeric NOT NULL DEFAULT 0,
  avg_save_rate numeric NOT NULL DEFAULT 0,
  avg_completion numeric NOT NULL DEFAULT 0,
  avg_score numeric NOT NULL DEFAULT 0,
  lift_vs_baseline numeric NOT NULL DEFAULT 0,
  example_storyboard_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pattern_type, niche, pattern_key)
);
CREATE INDEX cv5_winning_patterns_lookup_idx ON public.cv5_winning_patterns(pattern_type, niche, avg_score DESC) WHERE is_active;

GRANT SELECT ON public.cv5_winning_patterns TO authenticated;
GRANT ALL ON public.cv5_winning_patterns TO service_role;
ALTER TABLE public.cv5_winning_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read v5 patterns" ON public.cv5_winning_patterns FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role v5 patterns" ON public.cv5_winning_patterns FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.cv5_pattern_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  videos_analyzed integer NOT NULL DEFAULT 0,
  patterns_found integer NOT NULL DEFAULT 0,
  triggered_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cv5_pattern_runs TO authenticated;
GRANT ALL ON public.cv5_pattern_runs TO service_role;
ALTER TABLE public.cv5_pattern_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read v5 pattern runs" ON public.cv5_pattern_runs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role v5 pattern runs" ON public.cv5_pattern_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER cv5_video_analytics_updated_at BEFORE UPDATE ON public.cv5_video_analytics FOR EACH ROW EXECUTE FUNCTION public.cv5_set_updated_at();
CREATE TRIGGER cv5_winning_patterns_updated_at BEFORE UPDATE ON public.cv5_winning_patterns FOR EACH ROW EXECUTE FUNCTION public.cv5_set_updated_at();

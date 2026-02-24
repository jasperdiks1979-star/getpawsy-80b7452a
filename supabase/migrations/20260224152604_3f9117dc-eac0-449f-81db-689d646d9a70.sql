
-- =============================================================
-- Autonomous SEO Engine — Schema
-- =============================================================

-- 1. Keyword clusters with intent & primary keyword
CREATE TABLE IF NOT EXISTS public.seo_clusters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  intent TEXT NOT NULL DEFAULT 'informational', -- commercial / informational / navigational
  primary_keyword TEXT NOT NULL,
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb, -- array of {query, impressions, position, clicks}
  primary_url TEXT, -- the chosen canonical URL for this cluster
  secondary_urls JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active', -- active / merged / archived
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Actions queue (UPDATE / NEW_URL / INTERNAL_LINKS)
CREATE TABLE IF NOT EXISTS public.seo_actions_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID,
  action_type TEXT NOT NULL, -- UPDATE / NEW_URL / INTERNAL_LINKS
  target_url TEXT NOT NULL,
  cluster_id UUID REFERENCES public.seo_clusters(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'planned', -- planned / approved / executed / rejected / skipped
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ,
  executed_by UUID
);

-- 3. Content drafts
CREATE TABLE IF NOT EXISTS public.seo_content_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID,
  action_id UUID REFERENCES public.seo_actions_queue(id) ON DELETE SET NULL,
  cluster_id UUID REFERENCES public.seo_clusters(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'guide', -- guide / blog / hub_section / faq
  title TEXT NOT NULL,
  meta_description TEXT,
  markdown TEXT,
  schema_json JSONB,
  internal_links JSONB DEFAULT '[]'::jsonb,
  word_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft', -- draft / approved / published / rejected
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Engine runs (trace per execution)
CREATE TABLE IF NOT EXISTS public.seo_engine_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'dry_run', -- dry_run / plan_only / plan_generate / plan_publish_index
  status TEXT NOT NULL DEFAULT 'running', -- running / completed / failed
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  triggered_by UUID,
  summary JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  clusters_found INTEGER DEFAULT 0,
  actions_planned INTEGER DEFAULT 0,
  drafts_generated INTEGER DEFAULT 0,
  urls_published INTEGER DEFAULT 0,
  urls_indexed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Engine config (singleton row)
CREATE TABLE IF NOT EXISTS public.seo_engine_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  max_new_urls_per_week INTEGER NOT NULL DEFAULT 3,
  max_updates_per_week INTEGER NOT NULL DEFAULT 5,
  max_title_rewrites_per_week INTEGER NOT NULL DEFAULT 5,
  max_indexing_per_day INTEGER NOT NULL DEFAULT 10,
  approval_required BOOLEAN NOT NULL DEFAULT true,
  auto_publish BOOLEAN NOT NULL DEFAULT false,
  min_words_guide INTEGER NOT NULL DEFAULT 900,
  min_words_blog INTEGER NOT NULL DEFAULT 600,
  min_impressions_quick_win INTEGER NOT NULL DEFAULT 20,
  quick_win_pos_min DOUBLE PRECISION NOT NULL DEFAULT 11,
  quick_win_pos_max DOUBLE PRECISION NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

-- Add FK from actions/drafts to runs
ALTER TABLE public.seo_actions_queue 
  ADD CONSTRAINT seo_actions_queue_run_id_fkey 
  FOREIGN KEY (run_id) REFERENCES public.seo_engine_runs(id) ON DELETE CASCADE;

ALTER TABLE public.seo_content_drafts
  ADD CONSTRAINT seo_content_drafts_run_id_fkey
  FOREIGN KEY (run_id) REFERENCES public.seo_engine_runs(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE public.seo_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_actions_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_content_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_engine_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_engine_config ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admin read seo_clusters" ON public.seo_clusters FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin write seo_clusters" ON public.seo_clusters FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin read seo_actions_queue" ON public.seo_actions_queue FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin write seo_actions_queue" ON public.seo_actions_queue FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin read seo_content_drafts" ON public.seo_content_drafts FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin write seo_content_drafts" ON public.seo_content_drafts FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin read seo_engine_runs" ON public.seo_engine_runs FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin write seo_engine_runs" ON public.seo_engine_runs FOR ALL USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin read seo_engine_config" ON public.seo_engine_config FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin write seo_engine_config" ON public.seo_engine_config FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Service role bypass for edge functions
CREATE POLICY "Service role seo_clusters" ON public.seo_clusters FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role seo_actions_queue" ON public.seo_actions_queue FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role seo_content_drafts" ON public.seo_content_drafts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role seo_engine_runs" ON public.seo_engine_runs FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role seo_engine_config" ON public.seo_engine_config FOR ALL USING (auth.role() = 'service_role');

-- Insert default config
INSERT INTO public.seo_engine_config (id) VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Updated_at triggers
CREATE TRIGGER update_seo_clusters_updated_at BEFORE UPDATE ON public.seo_clusters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_seo_content_drafts_updated_at BEFORE UPDATE ON public.seo_content_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_seo_engine_config_updated_at BEFORE UPDATE ON public.seo_engine_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Genesis Ω.5 Boardroom Layout Manager
CREATE TABLE IF NOT EXISTS public.genesis_boardroom_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  profile TEXT NOT NULL DEFAULT 'custom',
  theme TEXT NOT NULL DEFAULT 'dark',
  layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  widgets JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.genesis_boardroom_workspaces TO authenticated;
GRANT ALL ON public.genesis_boardroom_workspaces TO service_role;
ALTER TABLE public.genesis_boardroom_workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own workspaces" ON public.genesis_boardroom_workspaces FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.genesis_boardroom_workspace_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.genesis_boardroom_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  version INTEGER NOT NULL,
  layout JSONB NOT NULL,
  widgets JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.genesis_boardroom_workspace_versions TO authenticated;
GRANT ALL ON public.genesis_boardroom_workspace_versions TO service_role;
ALTER TABLE public.genesis_boardroom_workspace_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own versions" ON public.genesis_boardroom_workspace_versions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.genesis_boardroom_widgets_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  truth_source TEXT,
  default_w INTEGER NOT NULL DEFAULT 4,
  default_h INTEGER NOT NULL DEFAULT 4,
  min_w INTEGER NOT NULL DEFAULT 2,
  min_h INTEGER NOT NULL DEFAULT 2,
  supports_mobile BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_boardroom_widgets_registry TO authenticated;
GRANT ALL ON public.genesis_boardroom_widgets_registry TO service_role;
ALTER TABLE public.genesis_boardroom_widgets_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read registry" ON public.genesis_boardroom_widgets_registry FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.genesis_boardroom_widget_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  widget_key TEXT NOT NULL,
  workspace_id UUID,
  event TEXT NOT NULL,
  ms_open INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.genesis_boardroom_widget_usage TO authenticated;
GRANT ALL ON public.genesis_boardroom_widget_usage TO service_role;
ALTER TABLE public.genesis_boardroom_widget_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own usage" ON public.genesis_boardroom_widget_usage FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.genesis_boardroom_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL,
  overall_score NUMERIC NOT NULL,
  widgets_registered INTEGER NOT NULL,
  layouts_created INTEGER NOT NULL,
  profiles_count INTEGER NOT NULL,
  reuse_percentage NUMERIC NOT NULL,
  canonical_compliance NUMERIC NOT NULL,
  executive_readiness NUMERIC NOT NULL,
  performance_score NUMERIC NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.genesis_boardroom_certifications TO authenticated;
GRANT ALL ON public.genesis_boardroom_certifications TO service_role;
ALTER TABLE public.genesis_boardroom_certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read certs" ON public.genesis_boardroom_certifications FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.ω5_touch_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); NEW.version = OLD.version + 1; RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_ω5_workspaces_updated ON public.genesis_boardroom_workspaces;
CREATE TRIGGER trg_ω5_workspaces_updated BEFORE UPDATE ON public.genesis_boardroom_workspaces
  FOR EACH ROW EXECUTE FUNCTION public.ω5_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.ai_revenue_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text NOT NULL,
  product_id text,
  page_path text,
  source text NOT NULL DEFAULT 'ai_revenue_operator',
  metric_snapshot jsonb,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_revenue_recs_created_idx ON public.ai_revenue_recommendations(created_at DESC);
CREATE INDEX IF NOT EXISTS ai_revenue_recs_status_idx ON public.ai_revenue_recommendations(status, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_revenue_recs_category_idx ON public.ai_revenue_recommendations(category, severity);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_revenue_recommendations TO authenticated;
GRANT ALL ON public.ai_revenue_recommendations TO service_role;
ALTER TABLE public.ai_revenue_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ai recs" ON public.ai_revenue_recommendations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins write ai recs" ON public.ai_revenue_recommendations FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins update ai recs" ON public.ai_revenue_recommendations FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins delete ai recs" ON public.ai_revenue_recommendations FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE IF NOT EXISTS public.ai_content_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  product_id text,
  product_name text,
  prompt text,
  output text NOT NULL,
  model text,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_content_drafts_created_idx ON public.ai_content_drafts(created_at DESC);
CREATE INDEX IF NOT EXISTS ai_content_drafts_kind_idx ON public.ai_content_drafts(kind, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_content_drafts TO authenticated;
GRANT ALL ON public.ai_content_drafts TO service_role;
ALTER TABLE public.ai_content_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ai drafts" ON public.ai_content_drafts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins write ai drafts" ON public.ai_content_drafts FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins update ai drafts" ON public.ai_content_drafts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins delete ai drafts" ON public.ai_content_drafts FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
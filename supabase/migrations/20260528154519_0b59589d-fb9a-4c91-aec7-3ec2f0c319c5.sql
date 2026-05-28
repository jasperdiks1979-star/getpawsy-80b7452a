
CREATE TABLE public.ai_creative_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  target_ref text,
  title text NOT NULL,
  body text,
  variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_score numeric,
  quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric,
  expected_revenue_impact text,
  traffic_source text,
  status text NOT NULL DEFAULT 'suggested',
  model text,
  prompt_hash text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  dismissed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_creative_drafts TO authenticated;
GRANT ALL ON public.ai_creative_drafts TO service_role;

ALTER TABLE public.ai_creative_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_creative_drafts admin read"  ON public.ai_creative_drafts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "ai_creative_drafts admin write" ON public.ai_creative_drafts FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "ai_creative_drafts admin update"ON public.ai_creative_drafts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "ai_creative_drafts admin delete"ON public.ai_creative_drafts FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_ai_creative_drafts_status ON public.ai_creative_drafts(status, generated_at DESC);
CREATE INDEX idx_ai_creative_drafts_kind   ON public.ai_creative_drafts(kind, generated_at DESC);
CREATE INDEX idx_ai_creative_drafts_phash  ON public.ai_creative_drafts(prompt_hash);

CREATE TRIGGER update_ai_creative_drafts_updated_at
BEFORE UPDATE ON public.ai_creative_drafts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.ai_seo_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  affected_url text,
  title text NOT NULL,
  body text,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_score numeric,
  quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric,
  expected_seo_impact text,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'suggested',
  model text,
  prompt_hash text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  dismissed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_seo_drafts TO authenticated;
GRANT ALL ON public.ai_seo_drafts TO service_role;

ALTER TABLE public.ai_seo_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_seo_drafts admin read"  ON public.ai_seo_drafts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "ai_seo_drafts admin write" ON public.ai_seo_drafts FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "ai_seo_drafts admin update"ON public.ai_seo_drafts FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "ai_seo_drafts admin delete"ON public.ai_seo_drafts FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_ai_seo_drafts_status ON public.ai_seo_drafts(status, generated_at DESC);
CREATE INDEX idx_ai_seo_drafts_kind   ON public.ai_seo_drafts(kind, generated_at DESC);
CREATE INDEX idx_ai_seo_drafts_phash  ON public.ai_seo_drafts(prompt_hash);

CREATE TRIGGER update_ai_seo_drafts_updated_at
BEFORE UPDATE ON public.ai_seo_drafts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

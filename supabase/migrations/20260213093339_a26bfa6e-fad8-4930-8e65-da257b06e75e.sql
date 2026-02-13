
-- SEO auto-optimization changelog
CREATE TABLE public.seo_optimization_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('ctr', 'position', 'momentum', 'decay')),
  action_type TEXT NOT NULL,
  action_details JSONB NOT NULL DEFAULT '{}',
  metrics_snapshot JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'applied', 'dismissed', 'reverted')),
  applied_at TIMESTAMPTZ,
  applied_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.seo_optimization_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage optimization logs
CREATE POLICY "Admins can manage optimization logs"
ON public.seo_optimization_log
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Index for quick lookups
CREATE INDEX idx_seo_opt_log_slug ON public.seo_optimization_log (slug);
CREATE INDEX idx_seo_opt_log_status ON public.seo_optimization_log (status);
CREATE INDEX idx_seo_opt_log_created ON public.seo_optimization_log (created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_seo_opt_log_updated_at
BEFORE UPDATE ON public.seo_optimization_log
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

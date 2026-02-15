
-- Table for automated site health check results
CREATE TABLE public.site_health_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  check_type TEXT NOT NULL, -- 'scheduled' | 'manual'
  results JSONB NOT NULL DEFAULT '{}',
  warnings TEXT[] DEFAULT '{}',
  all_healthy BOOLEAN NOT NULL DEFAULT false,
  resolved_issues TEXT[] DEFAULT '{}'
);

-- Enable RLS
ALTER TABLE public.site_health_checks ENABLE ROW LEVEL SECURITY;

-- Only admins can read
CREATE POLICY "Admins can read health checks"
  ON public.site_health_checks
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role inserts via edge function (no user policy needed for INSERT)

-- Auto-cleanup: keep 7 days
CREATE INDEX idx_site_health_checks_created ON public.site_health_checks (created_at DESC);

-- Cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_old_health_checks()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.site_health_checks WHERE created_at < now() - interval '7 days';
END;
$$;


CREATE TABLE public.job_retry_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT,
  job_type TEXT,
  max_attempts INTEGER,
  backoff_minutes NUMERIC[],
  enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT job_retry_policies_at_least_one_field
    CHECK (provider IS NOT NULL OR job_type IS NOT NULL),
  CONSTRAINT job_retry_policies_max_attempts_positive
    CHECK (max_attempts IS NULL OR max_attempts > 0)
);

-- One policy per (provider, job_type) combination. NULLs are treated as
-- distinct via COALESCE so we can have a wildcard row per axis.
CREATE UNIQUE INDEX job_retry_policies_unique_scope
  ON public.job_retry_policies (
    COALESCE(provider, '*'),
    COALESCE(job_type, '*')
  );

CREATE INDEX job_retry_policies_enabled_idx
  ON public.job_retry_policies (enabled)
  WHERE enabled = true;

CREATE TRIGGER update_job_retry_policies_updated_at
  BEFORE UPDATE ON public.job_retry_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.job_retry_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage job_retry_policies"
  ON public.job_retry_policies FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service reads job_retry_policies"
  ON public.job_retry_policies FOR SELECT
  USING (true);

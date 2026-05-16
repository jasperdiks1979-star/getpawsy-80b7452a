CREATE TABLE IF NOT EXISTS public.admin_secrets (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
ALTER TABLE public.admin_secrets ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (which bypasses RLS) can read/write.
COMMENT ON TABLE public.admin_secrets IS 'Sensitive admin-managed runtime secrets (e.g. rotatable GH_PAT). Service role only. Never expose via PostgREST policies.';
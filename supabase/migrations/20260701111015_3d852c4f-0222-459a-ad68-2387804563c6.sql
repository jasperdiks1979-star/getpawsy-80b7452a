
CREATE TABLE public.admin_guard_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,
  method TEXT,
  path TEXT,
  auth_mode TEXT NOT NULL,
  user_id UUID,
  user_email TEXT,
  outcome TEXT NOT NULL,
  status_code INT,
  reason TEXT,
  ip TEXT,
  user_agent TEXT,
  request_id TEXT,
  duration_ms INT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_guard_audit_log_created_at_idx ON public.admin_guard_audit_log (created_at DESC);
CREATE INDEX admin_guard_audit_log_function_idx ON public.admin_guard_audit_log (function_name, created_at DESC);
CREATE INDEX admin_guard_audit_log_user_idx ON public.admin_guard_audit_log (user_id, created_at DESC);
CREATE INDEX admin_guard_audit_log_outcome_idx ON public.admin_guard_audit_log (outcome, created_at DESC);

GRANT ALL ON public.admin_guard_audit_log TO service_role;
GRANT SELECT ON public.admin_guard_audit_log TO authenticated;

ALTER TABLE public.admin_guard_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read admin guard audit log"
ON public.admin_guard_audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Per-release issue tracking: auto-detected fail reasons + custom issues
-- get a fix-status (open / in_progress / resolved) and an admin assignee.

CREATE TYPE public.release_issue_status AS ENUM ('open', 'in_progress', 'resolved');
CREATE TYPE public.release_issue_source AS ENUM ('validation_fail', 'custom');

CREATE TABLE public.release_report_issues (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id    UUID NOT NULL REFERENCES public.release_reports(id) ON DELETE CASCADE,
  -- Stable key so auto-detected validation fail reasons stay deduped
  -- across refreshes (e.g. 'validation_fail:missing gtin'). For custom
  -- issues the UI generates 'custom:<uuid>'.
  issue_key     TEXT NOT NULL,
  source        public.release_issue_source NOT NULL DEFAULT 'custom',
  title         TEXT NOT NULL,
  description   TEXT,
  status        public.release_issue_status NOT NULL DEFAULT 'open',
  assignee_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (release_id, issue_key)
);

CREATE INDEX idx_release_issues_release ON public.release_report_issues(release_id);
CREATE INDEX idx_release_issues_assignee ON public.release_report_issues(assignee_id);
CREATE INDEX idx_release_issues_status ON public.release_report_issues(status);

ALTER TABLE public.release_report_issues ENABLE ROW LEVEL SECURITY;

-- Admins-only: same access model as release_reports itself.
CREATE POLICY "Admins can view release issues"
  ON public.release_report_issues FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert release issues"
  ON public.release_report_issues FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update release issues"
  ON public.release_report_issues FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete release issues"
  ON public.release_report_issues FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-stamp updated_at + resolved_at transitions
CREATE OR REPLACE FUNCTION public.touch_release_issue()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'resolved' AND (OLD.status IS DISTINCT FROM 'resolved') THEN
    NEW.resolved_at := now();
  ELSIF NEW.status <> 'resolved' THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_touch_release_issue
  BEFORE UPDATE ON public.release_report_issues
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_release_issue();

-- Lookup helper: list all admin users (for the assignee dropdown).
-- Returns id + email + display_name; admin-gated so non-admins can't
-- enumerate the user base.
CREATE OR REPLACE FUNCTION public.list_admin_assignees()
RETURNS TABLE (id UUID, email TEXT, display_name TEXT)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ur.user_id AS id,
    p.email,
    COALESCE(p.full_name, p.email) AS display_name
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'admin'
  ORDER BY COALESCE(p.full_name, p.email) NULLS LAST;
END;
$$;
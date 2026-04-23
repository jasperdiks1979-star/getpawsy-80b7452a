
-- Release reports: track each published release + auto-attached merchant feed validation/sync
CREATE TABLE public.release_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | syncing | validating | completed | failed
  sync_run_id TEXT,
  sync_summary JSONB,
  validation_summary JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.release_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view release reports"
ON public.release_reports
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can create release reports"
ON public.release_reports
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = reported_by);

CREATE POLICY "Admins can update release reports"
ON public.release_reports
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_release_reports_updated_at
BEFORE UPDATE ON public.release_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_release_reports_created_at ON public.release_reports(created_at DESC);

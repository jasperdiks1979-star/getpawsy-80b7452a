
-- Table for tracking URL indexing submissions with dedupe
CREATE TABLE public.indexing_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  run_id UUID REFERENCES public.job_runs(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  response_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for dedupe lookups (URL + recent submissions)
CREATE INDEX idx_indexing_submissions_url_date ON public.indexing_submissions (url, submitted_at DESC);
CREATE INDEX idx_indexing_submissions_run_id ON public.indexing_submissions (run_id);

-- Enable RLS
ALTER TABLE public.indexing_submissions ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins can view indexing submissions"
ON public.indexing_submissions FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert indexing submissions"
ON public.indexing_submissions FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update indexing submissions"
ON public.indexing_submissions FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

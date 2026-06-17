
-- 1. Table
CREATE TABLE public.cinematic_v3_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_slug text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','scripting','voiceover','rendering','qa','needs_review','passed','failed','approved')),
  script jsonb,
  scenes jsonb,
  voiceover_url text,
  voiceover_transcript text,
  music_bed text,
  final_mp4_url text,
  duration_seconds numeric,
  qa_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  qa_total integer,
  qa_passed boolean NOT NULL DEFAULT false,
  failure_reasons text[] NOT NULL DEFAULT '{}',
  render_log text,
  voice_id text NOT NULL DEFAULT 'cgSgspJ2msm6clMCkdW9',
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pinterest_queue_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Grants (admin-only, no anon)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cinematic_v3_jobs TO authenticated;
GRANT ALL ON public.cinematic_v3_jobs TO service_role;

-- 3. RLS
ALTER TABLE public.cinematic_v3_jobs ENABLE ROW LEVEL SECURITY;

-- 4. Policies (admins only)
CREATE POLICY "Admins read v3 jobs"
  ON public.cinematic_v3_jobs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert v3 jobs"
  ON public.cinematic_v3_jobs FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update v3 jobs"
  ON public.cinematic_v3_jobs FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete v3 jobs"
  ON public.cinematic_v3_jobs FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. Indexes
CREATE INDEX idx_cinematic_v3_jobs_status ON public.cinematic_v3_jobs(status);
CREATE INDEX idx_cinematic_v3_jobs_created_at ON public.cinematic_v3_jobs(created_at DESC);
CREATE INDEX idx_cinematic_v3_jobs_product_id ON public.cinematic_v3_jobs(product_id);

-- 6. Touch trigger
CREATE TRIGGER trg_cinematic_v3_jobs_updated_at
  BEFORE UPDATE ON public.cinematic_v3_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

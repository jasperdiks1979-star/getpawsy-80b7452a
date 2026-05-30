
-- Real Runway pipeline jobs (separate from legacy slideshow system)
CREATE TABLE public.cinematic_runway_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_slug text NOT NULL,
  product_name text NOT NULL,
  product_image_url text,
  status text NOT NULL DEFAULT 'pending',
  -- pending | scripting | rendering_scenes | rendering_voice | awaiting_merge | merging | qa | ready_for_review | approved | failed
  script jsonb,
  -- { hook, problem, solution, cta, vo_text }
  scenes jsonb,
  -- [{ key, prompt, starting_frame_url, runway_task_id, clip_url, duration_s, status, error }]
  voiceover_url text,
  voiceover_duration_s numeric,
  captions jsonb,
  final_video_url text,
  qa_score numeric,
  qa_report jsonb,
  cost_cents integer NOT NULL DEFAULT 0,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cinematic_runway_jobs TO authenticated;
GRANT ALL ON public.cinematic_runway_jobs TO service_role;

ALTER TABLE public.cinematic_runway_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read runway jobs"
ON public.cinematic_runway_jobs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert runway jobs"
ON public.cinematic_runway_jobs FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update runway jobs"
ON public.cinematic_runway_jobs FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete runway jobs"
ON public.cinematic_runway_jobs FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER cinematic_runway_jobs_updated_at
BEFORE UPDATE ON public.cinematic_runway_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public storage bucket for runway scene clips, voiceovers, and final videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('cinematic-runway', 'cinematic-runway', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Runway assets public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'cinematic-runway');

CREATE POLICY "Runway assets admin write"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'cinematic-runway' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Runway assets admin update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'cinematic-runway' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Runway assets admin delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'cinematic-runway' AND public.has_role(auth.uid(), 'admin'));

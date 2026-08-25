CREATE TABLE IF NOT EXISTS public.gcd_backfill_state (
  id integer PRIMARY KEY DEFAULT 1,
  paused boolean NOT NULL DEFAULT false,
  paused_reason text,
  paused_at timestamptz,
  resume_after timestamptz,
  last_run_at timestamptz,
  last_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT gcd_backfill_state_singleton CHECK (id = 1)
);
INSERT INTO public.gcd_backfill_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
GRANT SELECT ON public.gcd_backfill_state TO authenticated;
GRANT ALL ON public.gcd_backfill_state TO service_role;
ALTER TABLE public.gcd_backfill_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read gcd backfill state" ON public.gcd_backfill_state FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.gcd_visual_dna_backlog (
  creative_id text PRIMARY KEY,
  image_url text,
  status text NOT NULL DEFAULT 'deferred_due_to_credits',
  reason text,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_attempt_at timestamptz,
  deterministic_done boolean NOT NULL DEFAULT false,
  phash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gcd_visual_dna_backlog_status_idx ON public.gcd_visual_dna_backlog (status);
GRANT SELECT ON public.gcd_visual_dna_backlog TO authenticated;
GRANT ALL ON public.gcd_visual_dna_backlog TO service_role;
ALTER TABLE public.gcd_visual_dna_backlog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read gcd visual dna backlog" ON public.gcd_visual_dna_backlog FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
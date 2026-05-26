
CREATE TABLE IF NOT EXISTS public.cinematic_voiceover_key_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  key_fingerprint text,
  state text NOT NULL DEFAULT 'unknown' CHECK (state IN ('ok','invalid','unknown')),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cinematic_voiceover_key_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin all cinematic_voiceover_key_state"
ON public.cinematic_voiceover_key_state
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.cinematic_voiceover_key_state (id, state) VALUES (true, 'unknown')
ON CONFLICT (id) DO NOTHING;

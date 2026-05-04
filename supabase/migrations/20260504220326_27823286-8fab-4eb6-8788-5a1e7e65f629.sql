-- Runtime settings: single source of truth for Pinterest mode (overrides env secret)
CREATE TABLE IF NOT EXISTS public.pinterest_runtime_settings (
  id integer PRIMARY KEY DEFAULT 1,
  mode text NOT NULL DEFAULT 'sandbox' CHECK (mode IN ('sandbox','production')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT singleton CHECK (id = 1)
);

INSERT INTO public.pinterest_runtime_settings (id, mode)
VALUES (1, 'sandbox')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pinterest_runtime_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read pinterest mode" ON public.pinterest_runtime_settings;
CREATE POLICY "Authenticated can read pinterest mode"
  ON public.pinterest_runtime_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage pinterest mode" ON public.pinterest_runtime_settings;
CREATE POLICY "Admins manage pinterest mode"
  ON public.pinterest_runtime_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Cleanup: remove failed + draft items, reset retries on queued
DELETE FROM public.pinterest_pin_queue WHERE status IN ('failed','draft');
UPDATE public.pinterest_pin_queue SET retries = 0, error_message = NULL WHERE status = 'queued';
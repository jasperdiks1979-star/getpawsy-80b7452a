
CREATE TABLE IF NOT EXISTS public.pinterest_batch_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_tag text NOT NULL UNIQUE,
  pin_ids uuid[] NOT NULL,
  snapshot jsonb NOT NULL,
  lifted_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz,
  restored boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinterest_batch_overrides TO authenticated;
GRANT ALL ON public.pinterest_batch_overrides TO service_role;

ALTER TABLE public.pinterest_batch_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read batch overrides"
  ON public.pinterest_batch_overrides FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins write batch overrides"
  ON public.pinterest_batch_overrides FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.check_and_restore_batch_gates(_batch_tag text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ov record;
  total int;
  terminal int;
  snap jsonb;
BEGIN
  SELECT * INTO ov FROM public.pinterest_batch_overrides
    WHERE batch_tag = _batch_tag AND restored = false;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'status', 'no_active_override');
  END IF;

  SELECT count(*) INTO total FROM public.pinterest_pin_queue WHERE id = ANY(ov.pin_ids);
  SELECT count(*) INTO terminal FROM public.pinterest_pin_queue
    WHERE id = ANY(ov.pin_ids)
      AND status IN ('posted','failed','rejected','skipped','blocked_legacy_source');

  IF terminal < total THEN
    RETURN jsonb_build_object('ok', true, 'status', 'in_progress',
      'terminal', terminal, 'total', total);
  END IF;

  snap := ov.snapshot;
  UPDATE public.pinterest_credit_state
    SET publishing_paused       = COALESCE((snap->>'publishing_paused')::boolean, true),
        manual_pause            = COALESCE((snap->>'manual_pause')::boolean, true),
        autopilot_disabled      = COALESCE((snap->>'autopilot_disabled')::boolean, true),
        ai_generation_paused    = COALESCE((snap->>'ai_generation_paused')::boolean, true),
        image_generation_killed = COALESCE((snap->>'image_generation_killed')::boolean, true),
        manual_pause_reason     = 'auto_restored_after_batch_' || _batch_tag,
        manual_pause_at         = now(),
        updated_at              = now()
    WHERE id = ov.id OR true;

  UPDATE public.pinterest_batch_overrides
    SET restored = true, restored_at = now(), updated_at = now()
    WHERE id = ov.id;

  RETURN jsonb_build_object('ok', true, 'status', 'restored',
    'terminal', terminal, 'total', total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_restore_batch_gates(text) TO authenticated, service_role;

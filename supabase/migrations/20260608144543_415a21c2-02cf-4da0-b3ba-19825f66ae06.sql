
-- Helper: apply a single pin's repair result
CREATE OR REPLACE FUNCTION public.apply_pinterest_pin_repair(
  p_pin_id uuid,
  p_final_url text,
  p_http_status int,
  p_validation_status text,
  p_repair_strategy text,
  p_error text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.pinterest_pin_queue
     SET final_resolved_url    = p_final_url,
         http_status           = p_http_status,
         validation_status     = p_validation_status,
         repair_strategy       = p_repair_strategy,
         repaired_at           = now(),
         last_validated_at     = now(),
         last_validation_error = p_error
   WHERE id = p_pin_id;
$$;

-- Helper: finalize an audit run
CREATE OR REPLACE FUNCTION public.finalize_pinterest_audit_run(
  p_run_id uuid,
  p_total int,
  p_valid int,
  p_broken int,
  p_summary jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.pinterest_pin_audit_runs
     SET finished_at = now(),
         pins_total  = p_total,
         pins_valid  = p_valid,
         pins_broken = p_broken,
         summary     = p_summary
   WHERE id = p_run_id;
$$;

-- Helper: cleanup a stray audit run
CREATE OR REPLACE FUNCTION public.cleanup_pinterest_audit_run(p_run_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.pinterest_pin_audit WHERE run_id = p_run_id;
  DELETE FROM public.pinterest_pin_audit_runs WHERE id = p_run_id;
$$;

REVOKE ALL ON FUNCTION public.apply_pinterest_pin_repair(uuid, text, int, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_pinterest_audit_run(uuid, int, int, int, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_pinterest_audit_run(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.apply_pinterest_pin_repair(uuid, text, int, text, text, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_pinterest_audit_run(uuid, int, int, int, jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_pinterest_audit_run(uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION public.pinterest_queue_auto_approve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auto_on boolean;
BEGIN
  IF NEW.status = 'queued' AND NEW.approved_at IS NULL THEN
    SELECT auto_approve_queue INTO auto_on
      FROM public.pinterest_runtime_settings
      WHERE id = 1;
    IF auto_on IS TRUE THEN
      NEW.approved_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pinterest_queue_auto_approve ON public.pinterest_pin_queue;
CREATE TRIGGER trg_pinterest_queue_auto_approve
BEFORE INSERT OR UPDATE OF status ON public.pinterest_pin_queue
FOR EACH ROW
EXECUTE FUNCTION public.pinterest_queue_auto_approve();
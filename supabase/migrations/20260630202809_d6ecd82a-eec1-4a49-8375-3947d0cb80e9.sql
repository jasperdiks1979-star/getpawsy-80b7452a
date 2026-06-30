-- Pinterest publishability invariant: a row can only be 'queued' if it has a pin_image_url.
-- This closes the handoff gap where creative factory jobs failed/retried but the
-- pinterest_pin_queue row remained in 'queued' lifecycle with no image, polluting the
-- canonical publishable view metrics.

CREATE OR REPLACE FUNCTION public.pinterest_pin_queue_enforce_image_for_queued()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- If a row enters/stays in 'queued' status without a usable image, auto-demote
  -- to 'draft' so the cron preflight + creative factory can regenerate it
  -- instead of inflating the publishable lifecycle count.
  IF NEW.status = 'queued'
     AND (NEW.pin_image_url IS NULL OR NEW.pin_image_url = '') THEN
    NEW.status := 'draft';
    NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pin_queue_image_invariant ON public.pinterest_pin_queue;
CREATE TRIGGER trg_pin_queue_image_invariant
BEFORE INSERT OR UPDATE ON public.pinterest_pin_queue
FOR EACH ROW
EXECUTE FUNCTION public.pinterest_pin_queue_enforce_image_for_queued();
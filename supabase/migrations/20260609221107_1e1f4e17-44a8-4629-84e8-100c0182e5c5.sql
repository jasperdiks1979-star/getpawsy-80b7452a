-- Hard safety guard: prevent automation (Pinterest, image migration, etc.)
-- from deactivating storefront products. Only callers that explicitly set
-- the session GUC `app.allow_deactivate` to 'true' may flip is_active to false.
CREATE OR REPLACE FUNCTION public.guard_products_deactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allow text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.is_active = true
     AND NEW.is_active = false THEN
    BEGIN
      allow := current_setting('app.allow_deactivate', true);
    EXCEPTION WHEN OTHERS THEN
      allow := NULL;
    END;
    IF allow IS DISTINCT FROM 'true' THEN
      NEW.is_active := true; -- silently veto; log the attempt
      RAISE WARNING 'Blocked attempt to deactivate product % (set app.allow_deactivate=true to override)', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_products_deactivation ON public.products;
CREATE TRIGGER trg_guard_products_deactivation
BEFORE UPDATE OF is_active ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.guard_products_deactivation();
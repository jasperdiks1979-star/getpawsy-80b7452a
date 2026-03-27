CREATE OR REPLACE FUNCTION public.trigger_feed_optimization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- On insert or significant update, rewrite optimized title/description inline
  -- This is a lightweight deterministic rewrite, no external calls
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (
    OLD.name IS DISTINCT FROM NEW.name OR
    OLD.category IS DISTINCT FROM NEW.category OR
    OLD.description IS DISTINCT FROM NEW.description
  )) THEN
    -- Call the edge function async via pg_net
    PERFORM net.http_post(
      url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/optimize-product-feed',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('product_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_feed_optimization
  AFTER INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_feed_optimization();
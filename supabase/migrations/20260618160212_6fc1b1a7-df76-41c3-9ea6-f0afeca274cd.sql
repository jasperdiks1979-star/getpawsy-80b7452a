
CREATE OR REPLACE FUNCTION public.cinematic_v3_post_approval_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    BEGIN
      SELECT value #>> '{}' INTO v_url FROM public.app_config WHERE key = 'post_approval_fn_url';
      SELECT value #>> '{}' INTO v_key FROM public.app_config WHERE key = 'post_approval_fn_key';
    EXCEPTION WHEN OTHERS THEN
      v_url := NULL;
    END;

    IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_key,
          'apikey', v_key
        ),
        body := jsonb_build_object('job_id', NEW.id)
      );
    END IF;

    INSERT INTO public.cinematic_v3_dispatch_log (event_type, product_id, product_slug, job_id, outcome, details)
    VALUES ('approval_trigger', NEW.product_id, NEW.product_slug, NEW.id, 'enqueued',
            jsonb_build_object('triggered_at', now()));
  END IF;
  RETURN NEW;
END;
$$;

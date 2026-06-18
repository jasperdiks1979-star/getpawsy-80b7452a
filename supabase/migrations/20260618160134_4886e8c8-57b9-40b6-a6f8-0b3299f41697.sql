
CREATE UNIQUE INDEX IF NOT EXISTS product_media_product_checksum_uniq
  ON public.product_media (product_id, checksum)
  WHERE checksum IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pinterest_video_assets_content_hash_uniq
  ON public.pinterest_video_assets (content_hash);

-- Partial unique index: only enforced for cinematic_v3 handoff rows.
CREATE UNIQUE INDEX IF NOT EXISTS pinterest_video_queue_v3_variation_uniq
  ON public.pinterest_video_queue (variation_hash)
  WHERE variation_hash ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

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
      SELECT value INTO v_url FROM public.app_config WHERE key = 'post_approval_fn_url';
      SELECT value INTO v_key FROM public.app_config WHERE key = 'post_approval_fn_key';
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

DROP TRIGGER IF EXISTS trg_cinematic_v3_post_approval ON public.cinematic_v3_jobs;
CREATE TRIGGER trg_cinematic_v3_post_approval
AFTER UPDATE OF status ON public.cinematic_v3_jobs
FOR EACH ROW
EXECUTE FUNCTION public.cinematic_v3_post_approval_dispatch();

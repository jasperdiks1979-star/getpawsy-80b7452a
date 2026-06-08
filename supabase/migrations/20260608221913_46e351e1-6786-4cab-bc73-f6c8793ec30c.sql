
-- 1) Add source column to pin audit (default 'pin_queue' for back-compat)
ALTER TABLE public.pinterest_pin_audit
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'pin_queue';

CREATE INDEX IF NOT EXISTS idx_pin_audit_source ON public.pinterest_pin_audit(source);

-- 2) Slug-sync log table
CREATE TABLE IF NOT EXISTS public.pinterest_slug_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID,
  old_slug TEXT NOT NULL,
  new_slug TEXT NOT NULL,
  table_name TEXT NOT NULL,
  rows_updated INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pinterest_slug_sync_log TO authenticated;
GRANT ALL ON public.pinterest_slug_sync_log TO service_role;

ALTER TABLE public.pinterest_slug_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slug_sync_log_admin_read"
  ON public.pinterest_slug_sync_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_slug_sync_log_product ON public.pinterest_slug_sync_log(product_id);
CREATE INDEX IF NOT EXISTS idx_slug_sync_log_created ON public.pinterest_slug_sync_log(created_at DESC);

-- 3) Trigger: when products.slug changes, auto-rewrite all Pinterest destination links
CREATE OR REPLACE FUNCTION public.sync_pinterest_destinations_on_slug_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old TEXT := '/products/' || OLD.slug;
  v_new TEXT := '/products/' || NEW.slug;
  v_rows INTEGER;
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug AND NEW.slug IS NOT NULL AND OLD.slug IS NOT NULL THEN
    -- pin queue: only future-publishable rows
    UPDATE public.pinterest_pin_queue
       SET destination_link = replace(destination_link, v_old, v_new),
           product_slug = NEW.slug,
           updated_at = now()
     WHERE status IN ('draft','queued','scheduled','publishing','failed')
       AND destination_link LIKE '%' || v_old || '%';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      INSERT INTO public.pinterest_slug_sync_log(product_id, old_slug, new_slug, table_name, rows_updated)
      VALUES (NEW.id, OLD.slug, NEW.slug, 'pinterest_pin_queue', v_rows);
    END IF;

    UPDATE public.pinterest_video_queue
       SET destination_url = replace(destination_url, v_old, v_new),
           updated_at = now()
     WHERE destination_url LIKE '%' || v_old || '%';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      INSERT INTO public.pinterest_slug_sync_log(product_id, old_slug, new_slug, table_name, rows_updated)
      VALUES (NEW.id, OLD.slug, NEW.slug, 'pinterest_video_queue', v_rows);
    END IF;

    UPDATE public.pinterest_publish_queue
       SET product_url = replace(product_url, v_old, v_new)
     WHERE product_url LIKE '%' || v_old || '%';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      INSERT INTO public.pinterest_slug_sync_log(product_id, old_slug, new_slug, table_name, rows_updated)
      VALUES (NEW.id, OLD.slug, NEW.slug, 'pinterest_publish_queue', v_rows);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_pinterest_destinations ON public.products;
CREATE TRIGGER trg_sync_pinterest_destinations
  AFTER UPDATE OF slug ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_pinterest_destinations_on_slug_change();

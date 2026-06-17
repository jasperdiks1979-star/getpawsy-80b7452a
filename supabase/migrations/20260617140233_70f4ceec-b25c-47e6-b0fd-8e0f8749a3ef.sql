
-- 1. Add tracking columns
ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS batch_id text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS creative_source_tracked text;

-- 2. Inference helper
CREATE OR REPLACE FUNCTION public.pinterest_infer_source_type(
  _meta jsonb,
  _pin_variant text,
  _content_type text,
  _image_url text
) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN coalesce(_meta->>'creative_source','') ILIKE '%creative_director%' THEN 'lifestyle_ai'
    WHEN coalesce(_meta->>'source_type','') <> '' THEN _meta->>'source_type'
    WHEN _pin_variant ILIKE 'lifestyle_%' OR _content_type ILIKE 'lifestyle%' THEN 'lifestyle_ai'
    WHEN _pin_variant ILIKE 'product_ai%' OR _content_type ILIKE 'product_ai%' THEN 'product_ai'
    WHEN _image_url ILIKE '%cjdropshipping%' OR _image_url ILIKE '%/cj/%' THEN 'cj'
    WHEN _pin_variant ILIKE 'manual%' THEN 'manual'
    ELSE 'cj'
  END;
$$;

-- 3. Insert trigger: assign batch_id + source_type if missing
CREATE OR REPLACE FUNCTION public.pinterest_pin_queue_tracking_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.batch_id IS NULL OR NEW.batch_id = '' THEN
    NEW.batch_id := coalesce(
      NEW.meta->>'batch_id',
      'auto-' || to_char(coalesce(NEW.created_at, now()) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
    );
  END IF;

  IF NEW.source_type IS NULL OR NEW.source_type = '' THEN
    NEW.source_type := public.pinterest_infer_source_type(
      NEW.meta, NEW.pin_variant, NEW.content_type, NEW.pin_image_url
    );
  END IF;

  IF NEW.creative_source_tracked IS NULL OR NEW.creative_source_tracked = '' THEN
    NEW.creative_source_tracked := coalesce(NEW.meta->>'creative_source', NEW.pin_variant);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pinterest_pin_queue_tracking ON public.pinterest_pin_queue;
CREATE TRIGGER trg_pinterest_pin_queue_tracking
  BEFORE INSERT OR UPDATE ON public.pinterest_pin_queue
  FOR EACH ROW EXECUTE FUNCTION public.pinterest_pin_queue_tracking_defaults();

-- 4. Backfill last 7 days
UPDATE public.pinterest_pin_queue
SET
  batch_id = coalesce(
    batch_id,
    meta->>'batch_id',
    'auto-' || to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  ),
  source_type = coalesce(
    source_type,
    public.pinterest_infer_source_type(meta, pin_variant, content_type, pin_image_url)
  ),
  creative_source_tracked = coalesce(
    creative_source_tracked,
    meta->>'creative_source',
    pin_variant
  )
WHERE created_at > now() - interval '7 days';

-- 5. Indexes for reporting
CREATE INDEX IF NOT EXISTS idx_ppq_batch_id ON public.pinterest_pin_queue (batch_id);
CREATE INDEX IF NOT EXISTS idx_ppq_source_type ON public.pinterest_pin_queue (source_type);
CREATE INDEX IF NOT EXISTS idx_ppq_status_created ON public.pinterest_pin_queue (status, created_at DESC);

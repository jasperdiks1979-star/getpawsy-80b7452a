
-- 1. Monitoring counter (no UI, just a queryable table)
CREATE TABLE IF NOT EXISTS public.pinterest_source_block_stats (
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  source_type text NOT NULL,
  blocked_count integer NOT NULL DEFAULT 0,
  last_blocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, source_type)
);
GRANT SELECT ON public.pinterest_source_block_stats TO authenticated;
GRANT ALL ON public.pinterest_source_block_stats TO service_role;
ALTER TABLE public.pinterest_source_block_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read pinterest_source_block_stats" ON public.pinterest_source_block_stats;
CREATE POLICY "Admins read pinterest_source_block_stats"
  ON public.pinterest_source_block_stats FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 2. Replace the tracking trigger with one that ALSO blocks CJ inserts
CREATE OR REPLACE FUNCTION public.pinterest_pin_queue_tracking_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _src text;
  _allowed text[] := ARRAY['lifestyle_ai','product_ai','cinematic_ai'];
BEGIN
  -- Compute defaults
  IF NEW.batch_id IS NULL OR NEW.batch_id = '' THEN
    NEW.batch_id := coalesce(
      NEW.meta->>'batch_id',
      'auto-' || to_char(coalesce(NEW.created_at, now()) AT TIME ZONE 'UTC', 'YYYY-MM-DD')
    );
  END IF;

  _src := coalesce(
    NULLIF(NEW.source_type,''),
    public.pinterest_infer_source_type(NEW.meta, NEW.pin_variant, NEW.content_type, NEW.pin_image_url)
  );
  NEW.source_type := _src;

  IF NEW.creative_source_tracked IS NULL OR NEW.creative_source_tracked = '' THEN
    NEW.creative_source_tracked := coalesce(NEW.meta->>'creative_source', NEW.pin_variant);
  END IF;

  -- AI-only gate on INSERT: silently drop non-AI sources
  IF TG_OP = 'INSERT' AND NOT (_src = ANY(_allowed)) THEN
    INSERT INTO public.pinterest_source_block_stats (day, source_type, blocked_count, last_blocked_at)
    VALUES ((now() AT TIME ZONE 'UTC')::date, _src, 1, now())
    ON CONFLICT (day, source_type)
    DO UPDATE SET blocked_count = pinterest_source_block_stats.blocked_count + 1,
                  last_blocked_at = excluded.last_blocked_at;
    RETURN NULL; -- skip the insert; caller sees zero rows affected
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger already exists from previous migration; recreate to ensure it points at the new function.
DROP TRIGGER IF EXISTS trg_pinterest_pin_queue_tracking ON public.pinterest_pin_queue;
CREATE TRIGGER trg_pinterest_pin_queue_tracking
  BEFORE INSERT OR UPDATE ON public.pinterest_pin_queue
  FOR EACH ROW EXECUTE FUNCTION public.pinterest_pin_queue_tracking_defaults();

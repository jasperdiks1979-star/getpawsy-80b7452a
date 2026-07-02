
CREATE OR REPLACE FUNCTION public.fse_map_event_kind(_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _name
    WHEN 'add_to_cart'      THEN 'add_to_cart'
    WHEN 'begin_checkout'   THEN 'checkout_start'
    WHEN 'payment_success'  THEN 'purchase'
    WHEN 'purchase'         THEN 'purchase'
    WHEN 'view_item'        THEN 'product_view'
    WHEN 'pdp_view'         THEN 'product_view'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.fse_safe_uuid(_txt text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN _txt::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fse_mirror_from_lp_funnel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _kind text := public.fse_map_event_kind(NEW.event_name);
BEGIN
  IF _kind IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.is_bot, false) THEN RETURN NEW; END IF;
  IF COALESCE(NEW.classification, '') IN ('crawler','bot','pre_render','qa') THEN RETURN NEW; END IF;

  INSERT INTO public.first_sales_events (
    id, occurred_at, event_kind, session_id, visitor_id, product_id,
    traffic_source, device, country, revenue, confidence, why, evidence, journey
  ) VALUES (
    gen_random_uuid(),
    COALESCE(NEW.created_at, now()),
    _kind,
    NEW.session_id,
    NULL,
    public.fse_safe_uuid(NEW.product_id),
    NEW.utm_source,
    NEW.device,
    NEW.geo_country,
    COALESCE(NEW.value, 0),
    COALESCE(NEW.traffic_quality_score, 100)::numeric / 100,
    'mirrored from lp_funnel_events.'||NEW.event_name,
    jsonb_build_object('source_event_id', NEW.id, 'source_table','lp_funnel_events','event_name', NEW.event_name),
    '[]'::jsonb
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fse_mirror_from_lp_funnel ON public.lp_funnel_events;
CREATE TRIGGER trg_fse_mirror_from_lp_funnel
AFTER INSERT ON public.lp_funnel_events
FOR EACH ROW EXECUTE FUNCTION public.fse_mirror_from_lp_funnel();

INSERT INTO public.first_sales_events (
  id, occurred_at, event_kind, session_id, visitor_id, product_id,
  traffic_source, device, country, revenue, confidence, why, evidence, journey
)
SELECT
  gen_random_uuid(),
  COALESCE(e.created_at, now()),
  public.fse_map_event_kind(e.event_name),
  e.session_id,
  NULL,
  public.fse_safe_uuid(e.product_id),
  e.utm_source,
  e.device,
  e.geo_country,
  COALESCE(e.value, 0),
  COALESCE(e.traffic_quality_score, 100)::numeric / 100,
  'backfilled from lp_funnel_events.'||e.event_name,
  jsonb_build_object('source_event_id', e.id, 'source_table','lp_funnel_events','event_name', e.event_name,'backfill', true),
  '[]'::jsonb
FROM public.lp_funnel_events e
WHERE e.created_at > now() - interval '30 days'
  AND public.fse_map_event_kind(e.event_name) IS NOT NULL
  AND COALESCE(e.is_bot, false) = false
  AND COALESCE(e.classification, '') NOT IN ('crawler','bot','pre_render','qa')
  AND NOT EXISTS (
    SELECT 1 FROM public.first_sales_events f
    WHERE (f.evidence->>'source_event_id')::uuid = e.id
  );

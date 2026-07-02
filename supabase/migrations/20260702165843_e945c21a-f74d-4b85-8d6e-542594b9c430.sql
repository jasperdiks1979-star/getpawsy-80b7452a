
-- 1) Upgraded mirror trigger: richer envelope stored in evidence jsonb
CREATE OR REPLACE FUNCTION public.fse_mirror_from_lp_funnel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _kind text := public.fse_map_event_kind(NEW.event_name);
  _visitor text := NULLIF(NEW.raw_payload->>'visitor_id', '');
  _canonical_channel text := NULLIF(NEW.raw_payload->>'canonical_channel', '');
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
    _visitor,
    public.fse_safe_uuid(NEW.product_id),
    COALESCE(NEW.utm_source, _canonical_channel, 'direct'),
    NEW.device,
    NEW.geo_country,
    COALESCE(NEW.value, 0),
    COALESCE(NEW.traffic_quality_score, 100)::numeric / 100,
    'mirrored from lp_funnel_events.'||NEW.event_name,
    jsonb_strip_nulls(jsonb_build_object(
      'source_event_id', NEW.id,
      'source_table', 'lp_funnel_events',
      'event_name', NEW.event_name,
      'page_path', NEW.page_path,
      'landing_page', NEW.landing_page,
      'utm_source', NEW.utm_source,
      'utm_medium', NEW.utm_medium,
      'utm_campaign', NEW.utm_campaign,
      'utm_content', NEW.utm_content,
      'canonical_channel', _canonical_channel,
      'browser', NEW.browser_family,
      'os', NEW.os_family,
      'variant_id', NULLIF(NEW.raw_payload->>'variant_id',''),
      'geo_tier', NEW.geo_tier
    )),
    '[]'::jsonb
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- 2) Mirror new orders into the ledger as canonical purchase events (schema-correct)
CREATE OR REPLACE FUNCTION public.fse_mirror_from_orders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _country text := NULLIF(NEW.shipping_address->>'country','');
BEGIN
  IF NEW.status IS DISTINCT FROM 'paid'
     AND NEW.status IS DISTINCT FROM 'completed'
     AND NEW.status IS DISTINCT FROM 'fulfilled'
     AND COALESCE(NEW.total_amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.first_sales_events (
    id, occurred_at, event_kind, session_id, visitor_id, product_id,
    traffic_source, device, country, revenue, confidence, why, evidence, journey
  ) VALUES (
    gen_random_uuid(),
    COALESCE(NEW.created_at, now()),
    'purchase',
    NEW.stripe_session_id,
    NEW.ga_client_id,
    NULL,
    'stripe',
    NULL,
    _country,
    COALESCE(NEW.total_amount, 0),
    1.0,
    'mirrored from orders',
    jsonb_strip_nulls(jsonb_build_object(
      'source_table','orders',
      'order_id', NEW.id,
      'stripe_session_id', NEW.stripe_session_id,
      'stripe_payment_intent_id', NEW.stripe_payment_intent_id,
      'status', NEW.status,
      'currency', NEW.currency,
      'ga_client_id', NEW.ga_client_id,
      'email_domain', split_part(COALESCE(NEW.customer_email,''),'@',2)
    )),
    '[]'::jsonb
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fse_mirror_from_orders ON public.orders;
CREATE TRIGGER trg_fse_mirror_from_orders
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.fse_mirror_from_orders();

-- 3) Backfill purchase events from existing orders (last 30 days)
INSERT INTO public.first_sales_events (
  id, occurred_at, event_kind, session_id, visitor_id, product_id,
  traffic_source, device, country, revenue, confidence, why, evidence, journey
)
SELECT
  gen_random_uuid(),
  COALESCE(o.created_at, now()),
  'purchase',
  o.stripe_session_id,
  o.ga_client_id,
  NULL,
  'stripe',
  NULL,
  NULLIF(o.shipping_address->>'country',''),
  COALESCE(o.total_amount, 0),
  1.0,
  'backfilled from orders',
  jsonb_strip_nulls(jsonb_build_object(
    'source_table','orders','order_id', o.id,
    'stripe_session_id', o.stripe_session_id,
    'status', o.status,'currency', o.currency,
    'ga_client_id', o.ga_client_id,'backfill', true
  )),
  '[]'::jsonb
FROM public.orders o
WHERE o.created_at > now() - interval '30 days'
  AND (o.status IN ('paid','completed','fulfilled') OR COALESCE(o.total_amount,0) > 0)
  AND NOT EXISTS (
    SELECT 1 FROM public.first_sales_events f
    WHERE (f.evidence->>'order_id')::uuid = o.id
  );

-- 4) Envelope-completeness view for Mission Control
CREATE OR REPLACE VIEW public.v_fse_envelope_quality
WITH (security_invoker = true) AS
SELECT
  f.event_kind,
  COUNT(*)                                                 AS total,
  COUNT(f.session_id)                                      AS has_session,
  COUNT(f.visitor_id)                                      AS has_visitor,
  COUNT(f.traffic_source)                                  AS has_source,
  COUNT(f.country)                                         AS has_country,
  COUNT(f.device)                                          AS has_device,
  COUNT(*) FILTER (WHERE f.evidence ? 'page_path')         AS has_page,
  COUNT(*) FILTER (WHERE f.evidence ? 'landing_page')      AS has_landing,
  COUNT(*) FILTER (WHERE f.evidence ? 'utm_source')        AS has_utm,
  COUNT(*) FILTER (WHERE f.evidence ? 'browser')           AS has_browser,
  COUNT(*) FILTER (WHERE f.evidence ? 'canonical_channel') AS has_channel,
  COUNT(f.product_id)                                      AS has_product
FROM public.first_sales_events f
WHERE f.occurred_at > now() - interval '30 days'
GROUP BY f.event_kind
ORDER BY total DESC;

GRANT SELECT ON public.v_fse_envelope_quality TO authenticated, service_role;

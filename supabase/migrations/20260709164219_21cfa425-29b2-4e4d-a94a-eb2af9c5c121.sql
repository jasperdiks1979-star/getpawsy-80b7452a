
CREATE OR REPLACE FUNCTION public.canonical_ingest_recent(hours integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  since timestamptz := now() - make_interval(hours => hours);
  v_cci int := 0;
  v_chk int := 0;
  v_ord int := 0;
BEGIN
  WITH inserted AS (
    INSERT INTO public.canonical_events (
      occurred_at, canonical_name, source_system, source_event_id,
      visitor_id, session_id, product_id, page_path, landing_page, referrer,
      utm_source, utm_medium, utm_campaign, country, device, meta, dedup_key
    )
    SELECT
      e.created_at,
      (CASE e.event_name
         WHEN 'page_view'               THEN 'CANONICAL_PAGE_VIEW'
         WHEN 'product_view'            THEN 'CANONICAL_PRODUCT_VIEW'
         WHEN 'product_card_click'      THEN 'CANONICAL_PRODUCT_VIEW'
         WHEN 'add_to_cart_click'       THEN 'CANONICAL_ADD_TO_CART'
         WHEN 'add_to_cart_success'     THEN 'CANONICAL_ADD_TO_CART'
         WHEN 'cart_open'               THEN 'CANONICAL_CART'
         WHEN 'checkout_click'          THEN 'CANONICAL_CHECKOUT'
         WHEN 'checkout_loaded'         THEN 'CANONICAL_CHECKOUT'
         WHEN 'payment_redirect_started' THEN 'CANONICAL_CHECKOUT'
         WHEN 'payment_success'         THEN 'CANONICAL_PURCHASE'
         WHEN 'purchase_confirmed'      THEN 'CANONICAL_PURCHASE'
         WHEN 'homepage_view'           THEN 'CANONICAL_PAGE_VIEW'
         WHEN 'collection_view'         THEN 'CANONICAL_PAGE_VIEW'
       END)::public.canonical_event_name,
      'cci'::public.canonical_source_system,
      e.id::text,
      e.visitor_id, e.session_id, e.product_id, e.page_path, e.landing_page, e.referrer,
      e.source, e.medium, e.campaign, e.country, e.device, COALESCE(e.meta, '{}'::jsonb),
      concat_ws('|', 'cci', e.id::text, e.session_id,
        (CASE e.event_name
           WHEN 'page_view'               THEN 'CANONICAL_PAGE_VIEW'
           WHEN 'product_view'            THEN 'CANONICAL_PRODUCT_VIEW'
           WHEN 'product_card_click'      THEN 'CANONICAL_PRODUCT_VIEW'
           WHEN 'add_to_cart_click'       THEN 'CANONICAL_ADD_TO_CART'
           WHEN 'add_to_cart_success'     THEN 'CANONICAL_ADD_TO_CART'
           WHEN 'cart_open'               THEN 'CANONICAL_CART'
           WHEN 'checkout_click'          THEN 'CANONICAL_CHECKOUT'
           WHEN 'checkout_loaded'         THEN 'CANONICAL_CHECKOUT'
           WHEN 'payment_redirect_started' THEN 'CANONICAL_CHECKOUT'
           WHEN 'payment_success'         THEN 'CANONICAL_PURCHASE'
           WHEN 'purchase_confirmed'      THEN 'CANONICAL_PURCHASE'
           WHEN 'homepage_view'           THEN 'CANONICAL_PAGE_VIEW'
           WHEN 'collection_view'         THEN 'CANONICAL_PAGE_VIEW'
         END),
        COALESCE(e.product_id, ''))
    FROM public.cci_events e
    WHERE e.created_at >= since
      AND e.event_name IN (
        'page_view',
        'product_view','product_card_click',
        'add_to_cart_click','add_to_cart_success',
        'cart_open','checkout_click','checkout_loaded','payment_redirect_started',
        'payment_success','purchase_confirmed','homepage_view','collection_view'
      )
    ON CONFLICT (dedup_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_cci FROM inserted;

  WITH inserted AS (
    INSERT INTO public.canonical_events (
      occurred_at, canonical_name, source_system, source_event_id,
      session_id, stripe_session_id, utm_source, country, device,
      value_cents, currency, meta, dedup_key
    )
    SELECT
      e.created_at,
      (CASE e.step
         WHEN 'begin_checkout'           THEN 'CANONICAL_CHECKOUT'
         WHEN 'checkout_loaded'          THEN 'CANONICAL_CHECKOUT'
         WHEN 'checkout_click'           THEN 'CANONICAL_CHECKOUT'
         WHEN 'payment_redirect_started' THEN 'CANONICAL_CHECKOUT'
         WHEN 'payment_success'          THEN 'CANONICAL_PURCHASE'
         WHEN 'purchase'                 THEN 'CANONICAL_PURCHASE'
       END)::public.canonical_event_name,
      'checkout_funnel'::public.canonical_source_system,
      e.id::text,
      e.session_id, e.stripe_session_id, e.source, e.geo_country, e.device,
      CASE WHEN e.value IS NOT NULL THEN (e.value * 100)::bigint END,
      e.currency, COALESCE(e.metadata, '{}'::jsonb),
      concat_ws('|', 'checkout_funnel', e.id::text, e.session_id,
        (CASE e.step
           WHEN 'begin_checkout'           THEN 'CANONICAL_CHECKOUT'
           WHEN 'checkout_loaded'          THEN 'CANONICAL_CHECKOUT'
           WHEN 'checkout_click'           THEN 'CANONICAL_CHECKOUT'
           WHEN 'payment_redirect_started' THEN 'CANONICAL_CHECKOUT'
           WHEN 'payment_success'          THEN 'CANONICAL_PURCHASE'
           WHEN 'purchase'                 THEN 'CANONICAL_PURCHASE'
         END),
        COALESCE(e.stripe_session_id, ''))
    FROM public.checkout_funnel_events e
    WHERE e.created_at >= since
      AND e.step IN ('begin_checkout','checkout_loaded','checkout_click','payment_redirect_started','payment_success','purchase')
    ON CONFLICT (dedup_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_chk FROM inserted;

  WITH inserted AS (
    INSERT INTO public.canonical_events (
      occurred_at, canonical_name, source_system, source_event_id,
      stripe_session_id, ga_client_id, order_id, value_cents, currency, meta, dedup_key
    )
    SELECT
      o.created_at,
      'CANONICAL_PURCHASE'::public.canonical_event_name,
      'orders'::public.canonical_source_system,
      o.id::text,
      o.stripe_session_id, o.ga_client_id, o.id,
      CASE WHEN o.total_amount IS NOT NULL THEN (o.total_amount * 100)::bigint END,
      o.currency, '{}'::jsonb,
      concat_ws('|', 'orders', o.id::text, '', 'CANONICAL_PURCHASE', COALESCE(o.stripe_session_id, ''))
    FROM public.orders o
    WHERE o.created_at >= since
      AND o.status = 'paid'
    ON CONFLICT (dedup_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_ord FROM inserted;

  PERFORM public.canonical_session_upsert_recent(since);

  RETURN jsonb_build_object(
    'since', since,
    'cci', v_cci,
    'checkout_funnel', v_chk,
    'orders', v_ord
  );
END $function$;

-- Backfill: replay the last 2h of dropped page_view CCI events into canonical.
SELECT public.canonical_ingest_recent(2);

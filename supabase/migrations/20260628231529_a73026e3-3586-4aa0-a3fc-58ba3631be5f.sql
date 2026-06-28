
DROP POLICY IF EXISTS "Anyone can submit valid contact messages" ON public.contact_messages;
CREATE POLICY "Anyone can submit valid contact messages"
ON public.contact_messages
FOR INSERT
TO anon, authenticated
WITH CHECK (
  email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  AND length(email) <= 255
  AND length(name) BETWEEN 2 AND 100
  AND length(subject) BETWEEN 3 AND 200
  AND length(message) BETWEEN 10 AND 5000
);

CREATE OR REPLACE FUNCTION public.contact_messages_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE recent_count int;
BEGIN
  SELECT count(*) INTO recent_count
  FROM public.contact_messages
  WHERE lower(email) = lower(NEW.email)
    AND created_at > now() - interval '1 hour';
  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'rate_limited: too many contact submissions for this email, try again later';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contact_messages_rate_limit_trg ON public.contact_messages;
CREATE TRIGGER contact_messages_rate_limit_trg
BEFORE INSERT ON public.contact_messages
FOR EACH ROW EXECUTE FUNCTION public.contact_messages_rate_limit();

DROP POLICY IF EXISTS "gcp_signals client insert" ON public.gcp_signals;
CREATE POLICY "gcp_signals client insert"
ON public.gcp_signals
FOR INSERT
TO authenticated
WITH CHECK (
  signal_type IS NOT NULL
  AND length(signal_type) BETWEEN 2 AND 64
  AND signal_type ~ '^[a-z0-9_.:-]+$'
  AND session_id IS NOT NULL
  AND length(session_id) BETWEEN 6 AND 128
  AND (signal_value IS NULL OR (signal_value >= 0 AND signal_value <= 1000000))
  AND coalesce(octet_length(coalesce(context::text,'')),0) <= 4096
);

DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
CREATE POLICY "Users can create their own orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  user_id IS NOT NULL
  AND auth.uid() = user_id
  AND customer_email IS NOT NULL
  AND lower(customer_email) = lower(auth.email())
);

DROP POLICY IF EXISTS "anon insert capi outbox" ON public.pinterest_capi_outbox;
CREATE POLICY "anon insert capi outbox"
ON public.pinterest_capi_outbox
FOR INSERT
TO anon, authenticated
WITH CHECK (
  event_name IN ('page_visit','view_category','search','add_to_cart','checkout','signup','lead','custom','purchase')
  AND (value IS NULL OR (value >= 0 AND value <= 100000))
  AND (currency IS NULL OR currency ~ '^[A-Z]{3}$')
  AND coalesce(length(coalesce(pin_id,'')),0) <= 64
  AND coalesce(length(coalesce(niche_key,'')),0) <= 64
  AND coalesce(length(coalesce(product_id,'')),0) <= 64
  AND coalesce(octet_length(coalesce(user_data::text,'')),0) <= 4096
  AND coalesce(octet_length(coalesce(custom_data::text,'')),0) <= 4096
);

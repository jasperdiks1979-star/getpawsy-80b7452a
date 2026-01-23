-- Fix warn-level security issues

-- 1. Add admin SELECT policy for profiles table so admins can view user profiles for customer support
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. Replace the notify_stock_subscribers function to remove hardcoded anon key
-- The edge function should accept unauthenticated requests from database triggers
CREATE OR REPLACE FUNCTION public.notify_stock_subscribers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only trigger when stock changes from 0 (or NULL) to > 0
  IF (OLD.stock IS NULL OR OLD.stock <= 0) AND NEW.stock > 0 THEN
    -- Use pg_net to call the edge function asynchronously
    -- No auth header needed - edge function validates via service role internally
    PERFORM net.http_post(
      url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/send-stock-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('productId', NEW.id)
    );
  END IF;
  
  RETURN NEW;
END;
$function$;
-- Create function to notify subscribers when product is back in stock
CREATE OR REPLACE FUNCTION public.notify_stock_subscribers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Only trigger when stock changes from 0 (or NULL) to > 0
  IF (OLD.stock IS NULL OR OLD.stock <= 0) AND NEW.stock > 0 THEN
    -- Get the Supabase URL and service role key from vault or use defaults
    supabase_url := current_setting('app.settings.supabase_url', true);
    service_role_key := current_setting('app.settings.service_role_key', true);
    
    -- Use pg_net to call the edge function asynchronously
    PERFORM net.http_post(
      url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/send-stock-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc'
      ),
      body := jsonb_build_object('productId', NEW.id)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on products table
DROP TRIGGER IF EXISTS trigger_notify_stock_subscribers ON public.products;

CREATE TRIGGER trigger_notify_stock_subscribers
  AFTER UPDATE OF stock ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_stock_subscribers();
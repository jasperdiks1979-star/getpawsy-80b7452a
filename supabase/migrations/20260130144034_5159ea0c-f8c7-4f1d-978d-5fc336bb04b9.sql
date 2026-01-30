-- Create a function to ping IndexNow when products are updated
CREATE OR REPLACE FUNCTION public.notify_indexnow_on_product_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- Only trigger for significant changes (not just stock updates)
  IF TG_OP = 'INSERT' OR 
     (TG_OP = 'UPDATE' AND (
       OLD.name IS DISTINCT FROM NEW.name OR
       OLD.description IS DISTINCT FROM NEW.description OR
       OLD.price IS DISTINCT FROM NEW.price OR
       OLD.slug IS DISTINCT FROM NEW.slug OR
       OLD.image_url IS DISTINCT FROM NEW.image_url OR
       OLD.is_active IS DISTINCT FROM NEW.is_active
     )) THEN
    
    -- Use pg_net to call the edge function asynchronously
    PERFORM net.http_post(
      url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/indexnow-ping',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('productId', NEW.id)
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for product changes
DROP TRIGGER IF EXISTS trigger_indexnow_product_change ON public.products;
CREATE TRIGGER trigger_indexnow_product_change
  AFTER INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_indexnow_on_product_change();

-- Create a function to ping IndexNow when blog posts are published
CREATE OR REPLACE FUNCTION public.notify_indexnow_on_blog_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- Only trigger when a post is published or significantly updated
  IF (TG_OP = 'INSERT' AND NEW.is_published = true) OR
     (TG_OP = 'UPDATE' AND NEW.is_published = true AND (
       OLD.is_published IS DISTINCT FROM NEW.is_published OR
       OLD.title IS DISTINCT FROM NEW.title OR
       OLD.content IS DISTINCT FROM NEW.content OR
       OLD.slug IS DISTINCT FROM NEW.slug
     )) THEN
    
    PERFORM net.http_post(
      url := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/indexnow-ping',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('blogSlug', NEW.slug)
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for blog changes
DROP TRIGGER IF EXISTS trigger_indexnow_blog_change ON public.blog_posts;
CREATE TRIGGER trigger_indexnow_blog_change
  AFTER INSERT OR UPDATE ON public.blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_indexnow_on_blog_change();
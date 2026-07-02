
CREATE OR REPLACE FUNCTION public.pinterest_success_probability(_product_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s numeric := 0;
  p RECORD;
  cooldown_days integer;
  last_pin_at timestamptz;
  img_count integer := 0;
BEGIN
  SELECT id, name, slug, us_stock, price, cost_price, images, category, meta_description, seo_title
    INTO p FROM public.products WHERE id = _product_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF p.name IS NOT NULL AND length(p.name) >= 10 THEN s := s + 6; END IF;
  IF p.seo_title IS NOT NULL AND length(p.seo_title) >= 20 THEN s := s + 6; END IF;
  IF p.meta_description IS NOT NULL AND length(p.meta_description) >= 60 THEN s := s + 6; END IF;
  IF p.slug IS NOT NULL AND length(p.slug) >= 5 THEN s := s + 6; END IF;
  IF p.category IS NOT NULL THEN s := s + 6; END IF;

  BEGIN
    img_count := COALESCE(array_length(p.images::text[], 1), 0);
  EXCEPTION WHEN others THEN img_count := 0;
  END;
  IF img_count >= 1 THEN s := s + 15; END IF;

  IF COALESCE(p.us_stock,0) >= 5 THEN s := s + 20;
  ELSIF COALESCE(p.us_stock,0) >= 1 THEN s := s + 10;
  ELSE s := s - 30;
  END IF;

  IF p.price IS NOT NULL AND p.cost_price IS NOT NULL AND p.price > 0 THEN
    IF (p.price - p.cost_price) / p.price >= 0.45 THEN s := s + 15;
    ELSIF (p.price - p.cost_price) / p.price >= 0.30 THEN s := s + 10;
    ELSIF (p.price - p.cost_price) / p.price >= 0.15 THEN s := s + 4;
    END IF;
  END IF;

  IF p.price BETWEEN 9 AND 500 THEN s := s + 5; END IF;

  SELECT MAX(created_at) INTO last_pin_at
    FROM public.pcie2_publish_queue
    WHERE product_id = _product_id AND status = 'published';
  IF last_pin_at IS NULL THEN
    s := s + 15;
  ELSE
    cooldown_days := EXTRACT(EPOCH FROM now() - last_pin_at) / 86400;
    IF cooldown_days >= 30 THEN s := s + 15;
    ELSIF cooldown_days >= 14 THEN s := s + 10;
    ELSIF cooldown_days >= 7  THEN s := s + 4;
    ELSE s := s - 10;
    END IF;
  END IF;

  RETURN GREATEST(0, LEAST(100, s));
END;
$$;

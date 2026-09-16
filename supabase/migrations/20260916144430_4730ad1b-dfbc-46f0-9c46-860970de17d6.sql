ALTER TABLE public.product_reviews
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_reviews_order_id ON public.product_reviews(order_id);

-- Is there a paid order, owned by this user, that contains this product?
CREATE OR REPLACE FUNCTION public.review_order_is_eligible(_order_id uuid, _user_id uuid, _product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = _order_id
      AND o.user_id = _user_id
      AND (o.payment_status = 'paid' OR o.status = 'paid' OR o.paid_at IS NOT NULL)
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS it
        WHERE (it->>'id') = _product_id::text
           OR (it->>'id') LIKE _product_id::text || '%'
           OR (it->>'product_id') = _product_id::text
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.product_reviews_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean := public.has_role(auth.uid(), 'admin');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT is_admin THEN
      NEW.is_approved := false;
    END IF;
    NEW.is_verified_buyer := NEW.order_id IS NOT NULL
      AND public.review_order_is_eligible(NEW.order_id, NEW.user_id, NEW.product_id);
    RETURN NEW;
  END IF;

  IF NOT is_admin THEN
    NEW.is_approved := OLD.is_approved;
    NEW.order_id := OLD.order_id;
    NEW.helpful_count := OLD.helpful_count;
  END IF;

  NEW.is_verified_buyer := NEW.order_id IS NOT NULL
    AND public.review_order_is_eligible(NEW.order_id, NEW.user_id, NEW.product_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_reviews_guard ON public.product_reviews;
CREATE TRIGGER trg_product_reviews_guard
BEFORE INSERT OR UPDATE ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.product_reviews_guard();

DROP POLICY IF EXISTS "Admins can view all reviews" ON public.product_reviews;
CREATE POLICY "Admins can view all reviews"
ON public.product_reviews FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can moderate reviews" ON public.product_reviews;
CREATE POLICY "Admins can moderate reviews"
ON public.product_reviews FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete reviews" ON public.product_reviews;
CREATE POLICY "Admins can delete reviews"
ON public.product_reviews FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
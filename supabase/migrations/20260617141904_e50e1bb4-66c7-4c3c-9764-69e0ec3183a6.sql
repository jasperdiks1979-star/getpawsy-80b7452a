
-- 1. Targets table
CREATE TABLE IF NOT EXISTS public.pinterest_category_targets (
  category_key text PRIMARY KEY,
  display_name text NOT NULL,
  target_pct numeric NOT NULL CHECK (target_pct >= 0 AND target_pct <= 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_category_targets TO authenticated;
GRANT ALL ON public.pinterest_category_targets TO service_role;
ALTER TABLE public.pinterest_category_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read category targets" ON public.pinterest_category_targets;
CREATE POLICY "Admins read category targets"
  ON public.pinterest_category_targets FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

INSERT INTO public.pinterest_category_targets (category_key, display_name, target_pct) VALUES
  ('dog_toys','Dog Toys',15),
  ('dog_walking','Dog Walking',15),
  ('dog_feeding','Dog Feeding',10),
  ('dog_grooming','Dog Grooming',10),
  ('dog_training','Dog Training',5),
  ('cat_toys','Cat Toys',15),
  ('cat_furniture','Cat Furniture',10),
  ('cat_litter','Cat Litter',10),
  ('cat_feeding','Cat Feeding',5),
  ('cat_grooming','Cat Grooming',5),
  ('travel','Travel Products',5),
  ('general','General Pet Products',5)
ON CONFLICT (category_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  target_pct = EXCLUDED.target_pct,
  updated_at = now();

-- 2. Category alias map: maps existing free-form category_key strings to our canonical 12 categories
CREATE OR REPLACE FUNCTION public.pinterest_canonical_category(_raw text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _raw ILIKE '%litter%' THEN 'cat_litter'
    WHEN _raw IN ('cat_tree','cat_trees','cat_furniture','cat_scratcher','cat_bed','cat_condo') OR _raw ILIKE 'cat_tree%' OR _raw ILIKE '%scratch%' THEN 'cat_furniture'
    WHEN _raw ILIKE 'cat_toy%' OR _raw = 'interactive_toy' THEN 'cat_toys'
    WHEN _raw ILIKE 'cat%feed%' OR _raw IN ('cat_bowl','cat_feeder') THEN 'cat_feeding'
    WHEN _raw ILIKE 'cat%groom%' THEN 'cat_grooming'
    WHEN _raw ILIKE 'dog_toy%' THEN 'dog_toys'
    WHEN _raw IN ('dog_collar','dog_leash','dog_walking','dog_harness') OR _raw ILIKE 'dog%walk%' OR _raw ILIKE '%leash%' OR _raw ILIKE '%collar%' THEN 'dog_walking'
    WHEN _raw ILIKE 'dog%feed%' OR _raw IN ('dog_bowl','bowl_station','feeder') THEN 'dog_feeding'
    WHEN _raw ILIKE 'dog%groom%' OR _raw = 'grooming' THEN 'dog_grooming'
    WHEN _raw ILIKE 'dog%train%' OR _raw = 'training' THEN 'dog_training'
    WHEN _raw IN ('dog_carrier','cat_carrier','travel','outdoor_house') OR _raw ILIKE '%carrier%' OR _raw ILIKE '%travel%' THEN 'travel'
    WHEN _raw IN ('dog_bed') THEN 'general'
    WHEN _raw IS NULL OR _raw = '' THEN 'general'
    ELSE 'general'
  END;
$$;

-- 3. Imbalance function — returns target vs actual share for last 7 days
CREATE OR REPLACE FUNCTION public.pinterest_category_imbalance(_days int DEFAULT 7)
RETURNS TABLE (
  category_key text,
  display_name text,
  target_pct numeric,
  actual_posts bigint,
  total_posts bigint,
  actual_pct numeric,
  gap_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH posted AS (
    SELECT public.pinterest_canonical_category(category_key) AS cat
    FROM public.pinterest_pin_queue
    WHERE source_type='lifestyle_ai'
      AND status='posted'
      AND posted_at > now() - make_interval(days => _days)
  ), totals AS (
    SELECT count(*)::bigint AS t FROM posted
  ), per_cat AS (
    SELECT cat, count(*)::bigint AS c FROM posted GROUP BY cat
  )
  SELECT
    t.category_key,
    t.display_name,
    t.target_pct,
    COALESCE(p.c, 0) AS actual_posts,
    (SELECT t FROM totals) AS total_posts,
    CASE WHEN (SELECT t FROM totals) > 0
      THEN round(100.0 * COALESCE(p.c,0) / (SELECT t FROM totals), 1)
      ELSE 0 END AS actual_pct,
    t.target_pct - CASE WHEN (SELECT t FROM totals) > 0
      THEN round(100.0 * COALESCE(p.c,0) / (SELECT t FROM totals), 1)
      ELSE 0 END AS gap_pct
  FROM public.pinterest_category_targets t
  LEFT JOIN per_cat p ON p.cat = t.category_key
  ORDER BY gap_pct DESC, t.target_pct DESC;
$$;
GRANT EXECUTE ON FUNCTION public.pinterest_category_imbalance(int) TO authenticated, service_role;

-- 4. Pick-next-product function — returns one product slug for the most under-served category
--    that has NOT been promoted in the last 30 days.
CREATE OR REPLACE FUNCTION public.pinterest_diversity_pick_next()
RETURNS TABLE (product_id uuid, product_slug text, category_key text, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cat record;
BEGIN
  FOR _cat IN
    SELECT * FROM public.pinterest_category_imbalance(7)
    WHERE gap_pct > 0
    ORDER BY gap_pct DESC
    LIMIT 5
  LOOP
    RETURN QUERY
    SELECT p.id, p.slug, _cat.category_key,
           format('underserved:%s gap=%s', _cat.category_key, _cat.gap_pct)
    FROM public.products p
    LEFT JOIN public.product_categories pc ON pc.product_id = p.id
    LEFT JOIN public.categories c ON c.id = pc.category_id
    WHERE p.is_active = true
      AND public.pinterest_canonical_category(coalesce(c.slug,'')) = _cat.category_key
      AND NOT EXISTS (
        SELECT 1 FROM public.pinterest_pin_queue q
        WHERE q.product_slug = p.slug
          AND q.status IN ('posted','queued')
          AND coalesce(q.posted_at, q.created_at) > now() - interval '30 days'
      )
    ORDER BY random()
    LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.pinterest_diversity_pick_next() TO authenticated, service_role;

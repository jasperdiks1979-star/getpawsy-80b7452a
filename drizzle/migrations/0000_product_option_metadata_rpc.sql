-- Storefront option/variant validation for products that the public catalog
-- view intentionally hides (e.g. stock = 0). The cart guard must know whether a
-- product requires an option choice BEFORE checkout, but out-of-stock products
-- are filtered out of products_public by the "Public can view listable
-- products" RLS policy, so the guard could not verify them.
--
-- This function is the narrowest possible read: option descriptors only, for
-- active non-duplicate products, by explicit id list. It exposes no price,
-- cost, supplier, revenue, or admin metadata, and does not widen the catalog
-- listing (no enumeration: callers must already know the product ids).
CREATE OR REPLACE FUNCTION public.product_option_metadata(p_ids uuid[])
RETURNS TABLE (
  id uuid,
  slug text,
  is_active boolean,
  stock integer,
  variants jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.slug,
    p.is_active,
    p.stock,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_strip_nulls(
            jsonb_build_object(
              'vid',            v->'vid',
              'variantKey',     v->'variantKey',
              'variantNameEn',  v->'variantNameEn',
              'variantStock',   v->'variantStock',
              'stock',          v->'stock',
              'inventories',    v->'inventories'
            )
          )
        )
        FROM jsonb_array_elements(p.variants) AS v
        WHERE jsonb_typeof(p.variants) = 'array'
          AND jsonb_typeof(v) = 'object'
      ),
      CASE WHEN jsonb_typeof(p.variants) = 'array' THEN '[]'::jsonb ELSE NULL END
    ) AS variants
  FROM public.products p
  WHERE p.id = ANY(COALESCE(p_ids, ARRAY[]::uuid[]))
    AND p.is_active = true
    AND COALESCE(p.is_duplicate, false) = false;
$$;

REVOKE ALL ON FUNCTION public.product_option_metadata(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_option_metadata(uuid[]) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.product_option_metadata(uuid[]) IS
  'Read-only storefront option/variant metadata for cart-side validation. Active, non-duplicate products only, looked up by explicit id. No pricing, supplier, cost or admin fields.';
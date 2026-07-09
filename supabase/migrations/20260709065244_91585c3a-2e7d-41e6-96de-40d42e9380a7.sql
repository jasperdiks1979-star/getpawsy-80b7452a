
-- ============================================================================
-- Pinterest Catalog Intelligence — additive read-only views
-- ============================================================================

CREATE OR REPLACE VIEW public.v_pinterest_product_potential AS
WITH base AS (
  SELECT
    p.id                                                     AS product_id,
    p.slug                                                   AS product_slug,
    p.name                                                   AS product_name,
    p.category                                               AS category,
    p.price                                                  AS price,
    (p.price - COALESCE(p.cost_price, 0))                    AS margin,
    COALESCE(array_length(p.images, 1), 0)                   AS image_count,
    LOWER(COALESCE(p.name,'') || ' ' || COALESCE(p.description,'')) AS text_blob,
    p.image_url                                              AS image_url,
    p.created_at                                             AS created_at,
    EXISTS (
      SELECT 1 FROM public.pcie2_publish_queue q
      WHERE q.product_id = p.id AND q.status = 'published'
    )                                                        AS ever_published,
    (
      SELECT COUNT(*) FROM public.pcie2_publish_queue q
      WHERE q.product_id = p.id AND q.status = 'published'
    )                                                        AS times_published
  FROM public.products p
  WHERE p.is_active = TRUE
),
cat_size AS (
  SELECT category, COUNT(*) AS cat_products,
         COUNT(*) FILTER (WHERE ever_published) AS cat_published
  FROM base
  GROUP BY category
),
scored AS (
  SELECT
    b.*,
    cs.cat_products,
    cs.cat_published,

    -- 1. category_headroom (0..15): fewer pins already published in category = more headroom
    LEAST(15, GREATEST(0, ROUND(
      15 * (1 - LEAST(1, cs.cat_published::numeric / GREATEST(4, cs.cat_products)))
    )))::int AS s_category_headroom,

    -- 2. margin_score (0..15): capped at $120 margin
    LEAST(15, GREATEST(0, ROUND(15 * LEAST(1, b.margin / 120.0))))::int AS s_margin,

    -- 3. price_band_score (0..10): Pinterest US sweet spot $60–$300
    CASE
      WHEN b.price BETWEEN 60  AND 300 THEN 10
      WHEN b.price BETWEEN 40  AND 60  THEN 7
      WHEN b.price BETWEEN 300 AND 450 THEN 7
      WHEN b.price BETWEEN 20  AND 40  THEN 4
      WHEN b.price > 450               THEN 4
      ELSE 2
    END AS s_price_band,

    -- 4. visual_richness (0..10): more images = more Pinterest hooks
    CASE
      WHEN b.image_count >= 8 THEN 10
      WHEN b.image_count >= 5 THEN 8
      WHEN b.image_count >= 3 THEN 6
      WHEN b.image_count >= 1 THEN 3
      ELSE 0
    END AS s_visual_richness,

    -- 5. lifestyle_appeal (0..10): matches lifestyle/aesthetic keywords
    LEAST(10, GREATEST(0,
        (CASE WHEN b.text_blob ~ '(cozy|luxury|stylish|modern|aesthetic|elegant|premium|designer|boutique)' THEN 4 ELSE 0 END)
      + (CASE WHEN b.text_blob ~ '(outdoor|patio|backyard|garden|indoor|home)' THEN 3 ELSE 0 END)
      + (CASE WHEN b.text_blob ~ '(furniture|hidden|end table|nightstand|farmhouse|scandinavian)' THEN 3 ELSE 0 END)
    ))::int AS s_lifestyle,

    -- 6. emotional_appeal (0..10)
    LEAST(10, GREATEST(0,
        (CASE WHEN b.text_blob ~ '(comfort|cozy|snuggl|cuddle|calm|relax|soothing)' THEN 4 ELSE 0 END)
      + (CASE WHEN b.text_blob ~ '(safe|secure|protect|durable|sturdy|heavy.duty)' THEN 3 ELSE 0 END)
      + (CASE WHEN b.text_blob ~ '(cute|adorable|happy|joy|love|dreamy)' THEN 3 ELSE 0 END)
    ))::int AS s_emotional,

    -- 7. seasonal_relevance (0..10) — anchored to summer (July)
    LEAST(10, GREATEST(0,
        (CASE WHEN b.text_blob ~ '(outdoor|patio|backyard|travel|stroller|carrier|portable|cooling|shade|sun|water|beach|road trip)' THEN 6 ELSE 0 END)
      + (CASE WHEN b.text_blob ~ '(aviary|kennel|catio|enclosure|hutch|coop|jogging)' THEN 4 ELSE 0 END)
      - (CASE WHEN b.text_blob ~ '(heated|warm winter|thermal|snow)' THEN 4 ELSE 0 END)
    ))::int AS s_seasonal,

    -- 8. us_demand_proxy (0..10) — Pinterest US pet-vertical priors
    (CASE b.category
       WHEN 'Cat Trees & Condos'    THEN 10
       WHEN 'Cat Litter Boxes'      THEN 10
       WHEN 'Cat Houses'            THEN 9
       WHEN 'Dog Beds'              THEN 9
       WHEN 'Cat Beds'              THEN 8
       WHEN 'Dog Toys'              THEN 7
       WHEN 'Dog Training'          THEN 7
       WHEN 'Dog Carriers'          THEN 7
       WHEN 'Dog Houses'            THEN 6
       WHEN 'Hamster Cages'         THEN 6
       WHEN 'Rabbit Cages'          THEN 6
       WHEN 'Bird Cages'            THEN 5
       WHEN 'Bird Houses'           THEN 5
       WHEN 'Cat Toys'              THEN 6
       WHEN 'Cat Furniture'         THEN 8
       WHEN 'Dog Collars & Leashes' THEN 5
       WHEN 'Dog Grooming'          THEN 5
       WHEN 'Dog Bowls & Feeders'   THEN 5
       WHEN 'Cat Bowls & Feeders'   THEN 5
       WHEN 'Dog Travel'            THEN 6
       WHEN 'Reptile Terrariums'    THEN 5
       ELSE 4
     END)::int AS s_us_demand,

    -- 9. uniqueness (0..5): products in small categories are more distinctive
    CASE
      WHEN cs.cat_products <= 5  THEN 5
      WHEN cs.cat_products <= 10 THEN 4
      WHEN cs.cat_products <= 20 THEN 3
      WHEN cs.cat_products <= 40 THEN 2
      ELSE 1
    END AS s_uniqueness,

    -- 10. board_compatibility (0..5): does any verified board name share a token
    (SELECT LEAST(5, COUNT(*) * 2)::int
     FROM public.pinterest_boards pb
     WHERE pb.production_verified AND NOT pb.is_blacklisted
       AND (
         LOWER(pb.name) ~ ANY (ARRAY[
           regexp_replace(LOWER(COALESCE(b.category,'')), '[^a-z0-9]+', ' ', 'g')
         ])
         OR LOWER(pb.name) ~ ANY (
           SELECT regexp_split_to_table(regexp_replace(LOWER(COALESCE(b.category,'')), '[^a-z0-9]+', ' ', 'g'), '\s+')
           WHERE regexp_replace(LOWER(COALESCE(b.category,'')), '[^a-z0-9]+', ' ', 'g') <> ''
         )
       )
    ) AS s_board_compat

  FROM base b
  JOIN cat_size cs ON cs.category IS NOT DISTINCT FROM b.category
),
final AS (
  SELECT
    s.*,
    -- Total 0..100 (sum of 15+15+10+10+10+10+10+10+5+5)
    (
      s.s_category_headroom + s.s_margin + s.s_price_band + s.s_visual_richness
      + s.s_lifestyle + s.s_emotional + s.s_seasonal + s.s_us_demand
      + s.s_uniqueness + COALESCE(s.s_board_compat,0)
    ) AS pinterest_potential_score
  FROM scored s
)
SELECT
  product_id, product_slug, product_name, category,
  price, margin, image_count, image_url, created_at,
  ever_published, times_published,
  cat_products, cat_published,
  s_category_headroom, s_margin, s_price_band, s_visual_richness,
  s_lifestyle, s_emotional, s_seasonal, s_us_demand,
  s_uniqueness, s_board_compat,
  pinterest_potential_score,
  CASE
    WHEN pinterest_potential_score >= 80 THEN 'Pinterest Hero'
    WHEN pinterest_potential_score >= 65 THEN 'High Potential'
    WHEN pinterest_potential_score >= 50 THEN 'Good Candidate'
    WHEN pinterest_potential_score >= 35 THEN 'Support Content'
    WHEN pinterest_potential_score >= 20 THEN 'Low Priority'
    ELSE 'Not Pinterest Suitable'
  END AS pinterest_class,
  -- publish priority: unpublished heroes first
  (CASE WHEN ever_published THEN 0 ELSE 1 END) * 1000
  + pinterest_potential_score AS publish_priority
FROM final;

ALTER VIEW public.v_pinterest_product_potential SET (security_invoker = true);
GRANT SELECT ON public.v_pinterest_product_potential TO authenticated;

-- ---------------------------------------------------------------------------
-- Category rollup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_pinterest_category_potential AS
SELECT
  COALESCE(category, 'Uncategorized') AS category,
  COUNT(*)                                                     AS products,
  COUNT(*) FILTER (WHERE ever_published)                       AS published,
  COUNT(*) FILTER (WHERE NOT ever_published)                   AS untapped,
  ROUND(AVG(pinterest_potential_score)::numeric, 1)            AS avg_score,
  MAX(pinterest_potential_score)                               AS max_score,
  COUNT(*) FILTER (WHERE pinterest_class = 'Pinterest Hero')                          AS heroes,
  COUNT(*) FILTER (WHERE pinterest_class = 'Pinterest Hero' AND NOT ever_published)   AS untapped_heroes,
  COUNT(*) FILTER (WHERE pinterest_class = 'High Potential')                          AS high_potential,
  COUNT(*) FILTER (WHERE pinterest_class IN ('Low Priority','Not Pinterest Suitable'))AS weak,
  ROUND(AVG(margin)::numeric, 2)                               AS avg_margin
FROM public.v_pinterest_product_potential
GROUP BY COALESCE(category, 'Uncategorized');

ALTER VIEW public.v_pinterest_category_potential SET (security_invoker = true);
GRANT SELECT ON public.v_pinterest_category_potential TO authenticated;

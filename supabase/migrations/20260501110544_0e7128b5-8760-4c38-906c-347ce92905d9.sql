-- Bulk reactivate cat/dog products from CJ that are currently inactive
-- Strategy: deterministic classification, no external API calls.
-- - Excludes non-cat/dog species (birds, reptiles, hamsters, fish, rabbits, etc.)
-- - Excludes policy-unsafe items (shock collars, prong, electric fence, etc.)
-- - Re-maps category to canonical category, keeps name+image+price
-- - Creates product_categories link
-- - Marks last_stock_sync_at to now() so background sync-stock cron will refresh stock first

CREATE OR REPLACE FUNCTION public.bulk_reactivate_cat_dog_products()
RETURNS TABLE (
  reactivated_count integer,
  skipped_other_species integer,
  skipped_policy_unsafe integer,
  skipped_no_image integer,
  skipped_no_price integer,
  category_links_created integer,
  details jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reactivated integer := 0;
  v_other integer := 0;
  v_unsafe integer := 0;
  v_no_image integer := 0;
  v_no_price integer := 0;
  v_links integer := 0;
  v_details jsonb := '[]'::jsonb;
  r record;
  v_canonical_cat text;
  v_cat_id uuid;
BEGIN
  FOR r IN
    SELECT id, name, COALESCE(category,'') AS category, COALESCE(description,'') AS description,
           image_url, price, cj_product_id
    FROM products
    WHERE COALESCE(is_active,false) = false
      AND COALESCE(is_duplicate,false) = false
      AND cj_product_id IS NOT NULL
  LOOP
    -- Non-cat/dog species exclusion (mirrors src/lib/pet-product-filter.ts)
    IF (r.name || ' ' || r.category || ' ' || r.description) ~* 
       '\y(bird|parrot|parakeet|cockatiel|canary|finch|budgie|macaw|aviary|reptile|snake|lizard|gecko|iguana|turtle|tortoise|terrarium|vivarium|chicken|poultry|hen|rooster|coop|hamster|gerbil|guinea\s*pig|chinchilla|ferret|mouse\s*cage|rat\s*cage|rodent|fish\s*tank|aquarium|betta|goldfish|aquatic|rabbit\s*hutch|rabbit\s*cage|bunny\s*cage)\y' THEN
      v_other := v_other + 1;
      CONTINUE;
    END IF;

    -- Policy-unsafe exclusion (shock, prong, electric fence, etc.)
    IF (r.name || ' ' || r.description) ~* 
       '(shock\s*(collar|training|correction|fence)|static\s*correction|electric\s*(fence|collar|shock|boundary)|e-shock|prong\s*collar|choke\s*chain|aversive|wireless\s*fence|stimulation\s*collar|anti[-\s]*bark\s*(shock|static|electric))' THEN
      v_unsafe := v_unsafe + 1;
      CONTINUE;
    END IF;

    -- Must have image + price
    IF r.image_url IS NULL OR r.image_url = '' THEN
      v_no_image := v_no_image + 1;
      CONTINUE;
    END IF;
    IF r.price IS NULL OR r.price <= 0 THEN
      v_no_price := v_no_price + 1;
      CONTINUE;
    END IF;

    -- Determine canonical category (cat-first since cat-trees is primary niche)
    v_canonical_cat := CASE
      -- Cat
      WHEN (r.name || ' ' || r.category) ~* '\y(cat\s*tree|cat\s*tower|cat\s*condo|sisal\s*post)\y' THEN 'Cat Trees & Condos'
      WHEN (r.name || ' ' || r.category) ~* '\ylitter\s*(box|tray|enclosure)\y|self.?cleaning\s*litter|cat\s*toilet' THEN 'Cat Litter Boxes'
      WHEN (r.name || ' ' || r.category) ~* '\y(scratching\s*post|cat\s*scratcher)\y' THEN 'Cat Scratching Posts'
      WHEN (r.name || ' ' || r.category) ~* '\y(cat\s*hammock|window\s*perch)\y' THEN 'Cat Hammocks'
      WHEN (r.name || ' ' || r.category) ~* '\y(cat\s*carrier|cat\s*backpack|kitten\s*carrier)\y' THEN 'Cat Carriers'
      WHEN (r.name || ' ' || r.category) ~* '\ycat\s*(bowl|feeder|fountain)|cat\s*water' THEN 'Cat Bowls & Feeders'
      WHEN (r.name || ' ' || r.category) ~* '\ycat\s*(brush|comb|grooming|nail)\y' THEN 'Cat Grooming'
      WHEN (r.name || ' ' || r.category) ~* '\ycat\s*(collar|harness|leash|tag)\y' THEN 'Cat Collars & Accessories'
      WHEN (r.name || ' ' || r.category) ~* '\ycat\s*(toy|teaser|wand|laser|catnip)\y|catnip' THEN 'Cat Toys'
      WHEN (r.name || ' ' || r.category) ~* '\ycat\s*(food|treat|snack)\y' THEN 'Cat Food & Treats'
      WHEN (r.name || ' ' || r.category) ~* '\ycat\s*(bed|cushion|mat|nest)\y|kitten\s*bed' THEN 'Cat Beds'
      WHEN (r.name || ' ' || r.category) ~* '\ycat\s*(house|cave|igloo)\y' THEN 'Cat Houses'
      WHEN (r.name || ' ' || r.category) ~* '\ycat\s*(furniture|shelf|wall)\y' THEN 'Cat Furniture'
      WHEN (r.name || ' ' || r.category) ~* '\ycat\s*(wheel|exercise)\y' THEN 'Cat Exercise Wheels'

      -- Dog
      WHEN (r.name || ' ' || r.category) ~* '\y(dog\s*bed|orthopedic\s*dog|memory\s*foam\s*dog|elevated\s*dog\s*bed|cooling\s*dog\s*bed|dog\s*cot|dog\s*mat|dog\s*cushion)\y' THEN 'Dog Beds'
      WHEN (r.name || ' ' || r.category) ~* '\y(dog\s*house|dog\s*kennel|dog\s*shelter|outdoor\s*dog\s*house)\y' THEN 'Dog Houses'
      WHEN (r.name || ' ' || r.category) ~* '\y(dog\s*carrier|dog\s*backpack|dog\s*stroller|pet\s*stroller|dog\s*sling)\y' THEN 'Dog Carriers'
      WHEN (r.name || ' ' || r.category) ~* '\y(dog\s*bowl|dog\s*feeder|dog\s*fountain|slow\s*feeder|automatic\s*dog\s*feeder)\y' THEN 'Dog Bowls & Feeders'
      WHEN (r.name || ' ' || r.category) ~* '\y(dog\s*brush|dog\s*comb|dog\s*grooming|dog\s*nail|dog\s*shampoo|deshedding|dog\s*dryer)\y' THEN 'Dog Grooming'
      WHEN (r.name || ' ' || r.category) ~* '\y(dog\s*collar|dog\s*leash|dog\s*harness|no.?pull|dog\s*lead)\y' THEN 'Dog Collars & Leashes'
      WHEN (r.name || ' ' || r.category) ~* '\y(dog\s*training|clicker|treat\s*pouch|potty\s*pad|puppy\s*pad|dog\s*whistle)\y' THEN 'Dog Training'
      WHEN (r.name || ' ' || r.category) ~* '\y(dog\s*toy|chew\s*toy|fetch|tennis\s*ball|tug\s*toy|squeaky\s*dog)\y' THEN 'Dog Toys'
      WHEN (r.name || ' ' || r.category) ~* '\y(dog\s*food|dog\s*treat|puppy\s*food|kibble)\y' THEN 'Dog Food & Treats'
      WHEN (r.name || ' ' || r.category) ~* '\y(dog\s*clothing|dog\s*sweater|dog\s*jacket|dog\s*coat|dog\s*raincoat|dog\s*hoodie|dog\s*shoes|dog\s*boots)\y' THEN 'Dog Clothing'

      -- Generic catches
      WHEN (r.name || ' ' || r.category) ~* '\y(cat|kitten|feline|kitty)\y' THEN 'Cat Toys'
      WHEN (r.name || ' ' || r.category) ~* '\y(dog|puppy|canine|pup)\y' THEN 'Dog Toys'
      ELSE NULL
    END;

    -- If no canonical match (= generic 'pet-supplies' without dog/cat marker), skip
    IF v_canonical_cat IS NULL THEN
      v_other := v_other + 1;
      CONTINUE;
    END IF;

    -- Reactivate
    UPDATE products
    SET is_active = true,
        category = v_canonical_cat,
        last_stock_sync_at = NULL,  -- forces sync-stock cron to refresh on next run
        stock_sync_status = 'pending_refresh',
        updated_at = now()
    WHERE id = r.id;

    v_reactivated := v_reactivated + 1;

    -- Link product_categories
    SELECT id INTO v_cat_id FROM categories WHERE name = v_canonical_cat LIMIT 1;
    IF v_cat_id IS NOT NULL THEN
      INSERT INTO product_categories (product_id, category_id)
      VALUES (r.id, v_cat_id)
      ON CONFLICT DO NOTHING;
      IF FOUND THEN v_links := v_links + 1; END IF;
    END IF;

    v_details := v_details || jsonb_build_object(
      'id', r.id, 'name', r.name, 'old_category', r.category, 'new_category', v_canonical_cat
    );
  END LOOP;

  RETURN QUERY SELECT v_reactivated, v_other, v_unsafe, v_no_image, v_no_price, v_links, v_details;
END;
$$;

-- product_categories needs a unique constraint for ON CONFLICT to work
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'product_categories_product_id_category_id_key'
  ) THEN
    ALTER TABLE product_categories 
      ADD CONSTRAINT product_categories_product_id_category_id_key 
      UNIQUE (product_id, category_id);
  END IF;
END $$;
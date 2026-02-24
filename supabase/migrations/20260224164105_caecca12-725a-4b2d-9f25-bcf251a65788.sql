
-- AGGRESSIVE TIER RECLASSIFICATION: Focus on Cat Trees & Small Animal Cages only
-- Tier A: Cat Trees/Condos + Small Animal Cages (hamster/rabbit/guinea pig) 
-- Tier B: Directly related accessories (cat furniture, scratching posts, cat beds)
-- Tier C: Everything else (noindex, follow)

-- Step 1: Reset ALL products to Tier C (noindex by default)
UPDATE public.products SET seo_tier = 'C' WHERE seo_tier IS DISTINCT FROM 'C';

-- Step 2: Tier A — Core niche products (Cat Trees & Condos + Small Animal Cages)
UPDATE public.products SET seo_tier = 'A'
WHERE is_active = true AND (
  -- Cat Trees & Condos (PRIMARY NICHE)
  category ILIKE '%cat tree%'
  OR category ILIKE '%cat condo%'
  OR category ILIKE '%cat tower%'
  OR category = 'Cat Trees & Condos'
  OR category = 'Cat Furniture'
  -- Small Animal Cages (SECONDARY NICHE — guinea pig, hamster, rabbit)
  OR category = 'Hamster Cages'
  OR category = 'Rabbit Cages'
  OR category ILIKE '%guinea pig%'
  -- High-value structural items with proven relevance
  OR (price > 80 AND category IN ('Cat Houses', 'Pet Houses', 'Pet Houses & Cages'))
);

-- Step 3: Tier B — Supporting accessories directly related to core niches
UPDATE public.products SET seo_tier = 'B'
WHERE is_active = true AND seo_tier = 'C' AND (
  -- Cat-related accessories supporting the cat tree niche
  category IN ('Cat Scratching Posts', 'Cat Beds', 'Cat Houses')
  -- Cat Litter Boxes (strong existing content hub)
  OR category = 'Cat Litter Boxes'
);

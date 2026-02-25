-- Aggressive mode: force ALL non-cat products to Tier C
-- This ensures any new non-cat products auto-noindex
UPDATE products 
SET seo_tier = 'C'
WHERE seo_tier != 'C'
  AND category NOT ILIKE '%cat%'
  AND category NOT ILIKE '%kitten%'
  AND category NOT ILIKE '%feline%';

-- Force cheap generic products (<$40) to Tier C even if cat-related
UPDATE products 
SET seo_tier = 'C'
WHERE seo_tier != 'C'
  AND price < 40
  AND category NOT IN ('Cat Trees & Condos', 'Cat Litter Boxes', 'Cat Houses', 'Cat Scratching Posts');

-- Ensure Cat Trees and Litter Boxes are always Tier A
UPDATE products 
SET seo_tier = 'A'
WHERE category IN ('Cat Trees & Condos', 'Cat Litter Boxes', 'Cat Houses', 'Cat Scratching Posts', 'Cat Beds')
  AND is_active = true
  AND seo_tier != 'A';

-- Blog: noindex all non-cat posts
UPDATE blog_posts 
SET is_noindexed = true 
WHERE is_noindexed IS NOT TRUE
  AND title NOT ILIKE '%cat%'
  AND title NOT ILIKE '%kitten%'
  AND title NOT ILIKE '%feline%'
  AND title NOT ILIKE '%litter%'
  AND title NOT ILIKE '%indoor%'
  AND category NOT ILIKE '%cat%';
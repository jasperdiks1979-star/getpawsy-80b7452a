
-- ============================================
-- AGGRESSIVE SEO TIER RESTRUCTURING
-- Indoor Cat Authority Consolidation
-- ============================================

-- PHASE 1: Promote Cat Litter Boxes from B1 → A (Secondary Revenue Engine)
UPDATE products SET seo_tier = 'A' 
WHERE category = 'Cat Litter Boxes' AND is_active = true;

-- PHASE 2: Promote Cat Toys from B2 → B1 (Indoor Cat Support)
UPDATE products SET seo_tier = 'B1' 
WHERE category = 'Cat Toys' AND is_active = true;

-- PHASE 3: Promote Cat Bowls & Feeders from B2 → B1 (Indoor Cat Support)  
UPDATE products SET seo_tier = 'B1'
WHERE category = 'Cat Bowls & Feeders' AND is_active = true;

-- PHASE 4: Promote Cat Grooming from B2 → B1 (Indoor Cat Support)
UPDATE products SET seo_tier = 'B1'
WHERE category = 'Cat Grooming' AND is_active = true;

-- PHASE 5: Demote non-cat Tier A products
-- Hamster Cages: A → B1
UPDATE products SET seo_tier = 'B1'
WHERE category = 'Hamster Cages' AND seo_tier = 'A';

-- Rabbit Cages: A → B1
UPDATE products SET seo_tier = 'B1'
WHERE category = 'Rabbit Cages' AND seo_tier = 'B1' OR (category = 'Rabbit Cages' AND seo_tier = 'A');

-- PHASE 6: Force Tier C on generic low-value products
-- Price < $40 + non-cat = Tier C
UPDATE products SET seo_tier = 'C'
WHERE price < 40 AND category NOT LIKE 'Cat%' AND seo_tier != 'C';

-- PHASE 7: Demote all Dog B2 to C (aggressive pruning)
UPDATE products SET seo_tier = 'C'
WHERE category IN ('Dog Toys', 'Dog Training', 'Dog Bowls & Feeders', 'Dog Food & Treats', 'Dog Grooming', 'Dog Houses')
AND seo_tier = 'B2';

-- PHASE 8: Demote Bird/Reptile/Fish to C
UPDATE products SET seo_tier = 'C'
WHERE category IN ('Bird Bowls & Feeders', 'Bird Toys', 'Bird Perches', 'Bird Nests', 'Bird Cages', 'Reptile Terrariums', 'Fish & Aquarium', 'Fish Tanks', 'Reptile Lighting')
AND seo_tier IN ('A', 'B1', 'B2');

-- PHASE 9: Demote Pet generic categories to C
UPDATE products SET seo_tier = 'C'
WHERE category IN ('pet-supplies', 'Pet Collars', 'Pet Shoes & Socks', 'Pet Plush Toys', 'Pet Chase Toys', 'Pet Mats', 'Pet Training and Educational Toys', 'Pet Houses')
AND seo_tier != 'C';

-- PHASE 10: Add a noindex_blog column to blog_posts for granular control
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS is_noindexed boolean DEFAULT false;

-- PHASE 11: Noindex all non-cat blog posts
UPDATE blog_posts SET is_noindexed = true
WHERE is_published = true
AND category NOT ILIKE '%cat%'
AND category NOT ILIKE '%litter%'
AND title NOT ILIKE '%cat%'
AND title NOT ILIKE '%litter%'
AND title NOT ILIKE '%kitten%'
AND title NOT ILIKE '%feline%';

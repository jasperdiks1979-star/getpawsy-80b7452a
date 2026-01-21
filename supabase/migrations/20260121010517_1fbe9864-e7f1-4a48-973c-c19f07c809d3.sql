-- Add missing subcategories that have products but no category entry
-- Dog Carriers under Dogs
INSERT INTO categories (id, name, slug, parent_id, description, display_order)
VALUES (
  gen_random_uuid(),
  'Dog Carriers',
  'dog-carriers',
  '11111111-0000-0000-0000-000000000001',
  'Travel carriers and bags for dogs',
  10
);

-- Rabbit Cages under Rabbits
INSERT INTO categories (id, name, slug, parent_id, description, display_order)
VALUES (
  gen_random_uuid(),
  'Rabbit Cages',
  'rabbit-cages',
  (SELECT id FROM categories WHERE slug = 'rabbits'),
  'Cages and hutches for rabbits',
  1
);

-- Fix products with old/incorrect category values
-- Update "Pet Houses" to "pet-houses" (which is under Dogs)
UPDATE products 
SET category = 'pet-houses'
WHERE category = 'Pet Houses' AND is_active = true;

-- Update "Pet Houses & Cages" to appropriate category based on product name
-- Check if they're hamster/guinea pig products
UPDATE products 
SET category = 'hamster-cages'
WHERE category = 'Pet Houses & Cages' 
  AND is_active = true
  AND (name ILIKE '%hamster%' OR name ILIKE '%small pet%' OR name ILIKE '%mouse%');

UPDATE products 
SET category = 'guinea-pig-cages'
WHERE category = 'Pet Houses & Cages' 
  AND is_active = true
  AND name ILIKE '%guinea%';

-- For remaining Pet Houses & Cages, assign to pet-houses (dog section)
UPDATE products 
SET category = 'pet-houses'
WHERE category = 'Pet Houses & Cages' AND is_active = true;

-- Update "Pet Training" to "pet-training" (which is under Dogs)
UPDATE products 
SET category = 'pet-training'
WHERE category = 'Pet Training' AND is_active = true;
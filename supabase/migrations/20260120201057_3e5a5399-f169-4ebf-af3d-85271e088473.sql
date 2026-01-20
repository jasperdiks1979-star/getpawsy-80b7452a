-- First, add new main categories
INSERT INTO categories (id, name, slug, description, icon, display_order, parent_id) VALUES
  ('66666666-0000-0000-0000-000000000006', 'Hamsters', 'hamsters', 'Alles voor je hamster', '🐹', 6, NULL),
  ('77777777-0000-0000-0000-000000000007', 'Rabbits', 'rabbits', 'Producten voor konijnen', '🐰', 7, NULL),
  ('88888888-0000-0000-0000-000000000008', 'Guinea Pigs', 'guinea-pigs', 'Verzorging voor cavia''s', '🐹', 8, NULL),
  ('99999999-0000-0000-0000-000000000009', 'Reptiles', 'reptiles', 'Reptielen benodigdheden', '🦎', 9, NULL)
ON CONFLICT (id) DO NOTHING;

-- Update existing main categories with proper icons and descriptions
UPDATE categories SET 
  icon = '🐕', 
  description = 'Alles voor je hond',
  display_order = 1
WHERE id = '11111111-0000-0000-0000-000000000001';

UPDATE categories SET 
  icon = '🐈', 
  description = 'Producten voor katten',
  display_order = 2
WHERE id = '22222222-0000-0000-0000-000000000002';

UPDATE categories SET 
  icon = '🐦', 
  description = 'Vogelbenodigdheden',
  display_order = 3
WHERE id = '33333333-0000-0000-0000-000000000003';

UPDATE categories SET 
  icon = '🐠', 
  description = 'Aquarium en vissenspullen',
  display_order = 5
WHERE id = '55555555-0000-0000-0000-000000000005';

-- Remove the generic "Small Animals" category since we now have specific ones
DELETE FROM categories WHERE id = '44444444-0000-0000-0000-000000000004';

-- Create DOG-specific subcategories
INSERT INTO categories (name, slug, description, parent_id, display_order) VALUES
  ('Dog Beds', 'dog-beds', 'Comfortabele hondenmanden en kussens', '11111111-0000-0000-0000-000000000001', 1),
  ('Dog Houses', 'dog-houses', 'Hondenhuizen en kennels', '11111111-0000-0000-0000-000000000001', 2),
  ('Dog Toys', 'dog-toys', 'Speelgoed voor honden', '11111111-0000-0000-0000-000000000001', 3),
  ('Dog Food & Treats', 'dog-food-treats', 'Hondenvoer en snacks', '11111111-0000-0000-0000-000000000001', 4),
  ('Dog Bowls & Feeders', 'dog-bowls-feeders', 'Voer- en drinkbakken voor honden', '11111111-0000-0000-0000-000000000001', 5),
  ('Dog Collars & Leashes', 'dog-collars-leashes', 'Halsbanden en riemen', '11111111-0000-0000-0000-000000000001', 6),
  ('Dog Grooming', 'dog-grooming', 'Verzorgingsproducten voor honden', '11111111-0000-0000-0000-000000000001', 7),
  ('Dog Training', 'dog-training', 'Trainingsproducten voor honden', '11111111-0000-0000-0000-000000000001', 8),
  ('Dog Clothing', 'dog-clothing', 'Hondenkleding en accessoires', '11111111-0000-0000-0000-000000000001', 9),
  ('Dog Carriers & Strollers', 'dog-carriers-strollers', 'Draagtas en buggy voor honden', '11111111-0000-0000-0000-000000000001', 10),
  ('Dog Gates & Fences', 'dog-gates-fences', 'Hekjes en afrastering', '11111111-0000-0000-0000-000000000001', 11),
  ('Dog Stairs & Ramps', 'dog-stairs-ramps', 'Trapjes en hellingen voor honden', '11111111-0000-0000-0000-000000000001', 12)
ON CONFLICT (slug) DO NOTHING;

-- Create CAT-specific subcategories (keep existing ones, add new)
INSERT INTO categories (name, slug, description, parent_id, display_order) VALUES
  ('Cat Beds', 'cat-beds', 'Kattenmanden en slaapplekken', '22222222-0000-0000-0000-000000000002', 1),
  ('Cat Houses', 'cat-houses', 'Kattenhuizen en iglo''s', '22222222-0000-0000-0000-000000000002', 2),
  ('Cat Toys', 'cat-toys', 'Speelgoed voor katten', '22222222-0000-0000-0000-000000000002', 3),
  ('Cat Food & Treats', 'cat-food-treats', 'Kattenvoer en snacks', '22222222-0000-0000-0000-000000000002', 4),
  ('Cat Bowls & Feeders', 'cat-bowls-feeders', 'Voer- en drinkbakken voor katten', '22222222-0000-0000-0000-000000000002', 5),
  ('Cat Collars & Accessories', 'cat-collars-accessories', 'Halsbanden en accessoires voor katten', '22222222-0000-0000-0000-000000000002', 6),
  ('Cat Grooming', 'cat-grooming', 'Verzorgingsproducten voor katten', '22222222-0000-0000-0000-000000000002', 7),
  ('Cat Carriers', 'cat-carriers', 'Draagtas en reismanden voor katten', '22222222-0000-0000-0000-000000000002', 8),
  ('Cat Furniture', 'cat-furniture', 'Katten meubels en klimwanden', '22222222-0000-0000-0000-000000000002', 9),
  ('Cat Hammocks', 'cat-hammocks', 'Hangmatten voor katten', '22222222-0000-0000-0000-000000000002', 10)
ON CONFLICT (slug) DO NOTHING;

-- Update existing cat subcategories to have proper parent
UPDATE categories SET parent_id = '22222222-0000-0000-0000-000000000002' 
WHERE slug IN ('cat-trees-and-condos', 'cat-litter-boxes', 'cat-scratching-posts');

-- Create BIRD-specific subcategories
INSERT INTO categories (name, slug, description, parent_id, display_order) VALUES
  ('Bird Toys', 'bird-toys', 'Speelgoed voor vogels', '33333333-0000-0000-0000-000000000003', 1),
  ('Bird Food & Treats', 'bird-food-treats', 'Vogelvoer en snacks', '33333333-0000-0000-0000-000000000003', 2),
  ('Bird Bowls & Feeders', 'bird-bowls-feeders', 'Voer- en drinkbakken voor vogels', '33333333-0000-0000-0000-000000000003', 3),
  ('Bird Perches', 'bird-perches', 'Zitstokken voor vogels', '33333333-0000-0000-0000-000000000003', 4),
  ('Bird Nests', 'bird-nests', 'Vogelnestjes en broedplekken', '33333333-0000-0000-0000-000000000003', 5),
  ('Bird Accessories', 'bird-accessories', 'Vogelaccessoires', '33333333-0000-0000-0000-000000000003', 6)
ON CONFLICT (slug) DO NOTHING;

-- Update existing bird subcategories
UPDATE categories SET parent_id = '33333333-0000-0000-0000-000000000003' 
WHERE slug IN ('bird-cages', 'bird-feeders');

-- Create FISH & AQUARIUM subcategories
INSERT INTO categories (name, slug, description, parent_id, display_order) VALUES
  ('Fish Tanks', 'fish-tanks', 'Aquariums en visbakken', '55555555-0000-0000-0000-000000000005', 1),
  ('Fish Tank Decorations', 'fish-tank-decorations', 'Aquariumdecoratie', '55555555-0000-0000-0000-000000000005', 2),
  ('Fish Food', 'fish-food', 'Vissenvoer', '55555555-0000-0000-0000-000000000005', 3),
  ('Fish Tank Filters', 'fish-tank-filters', 'Aquariumfilters', '55555555-0000-0000-0000-000000000005', 4),
  ('Fish Tank Lighting', 'fish-tank-lighting', 'Aquariumverlichting', '55555555-0000-0000-0000-000000000005', 5),
  ('Fish Tank Plants', 'fish-tank-plants', 'Aquariumplanten', '55555555-0000-0000-0000-000000000005', 6)
ON CONFLICT (slug) DO NOTHING;

-- Create HAMSTER subcategories
INSERT INTO categories (name, slug, description, parent_id, display_order) VALUES
  ('Hamster Cages', 'hamster-cages', 'Hamsterkooien', '66666666-0000-0000-0000-000000000006', 1),
  ('Hamster Beds & Houses', 'hamster-beds-houses', 'Hamsterhuisjes en slaapplekken', '66666666-0000-0000-0000-000000000006', 2),
  ('Hamster Toys', 'hamster-toys', 'Speelgoed voor hamsters', '66666666-0000-0000-0000-000000000006', 3),
  ('Hamster Food & Treats', 'hamster-food-treats', 'Hamstervoer en snacks', '66666666-0000-0000-0000-000000000006', 4),
  ('Hamster Wheels', 'hamster-wheels', 'Loopwielen voor hamsters', '66666666-0000-0000-0000-000000000006', 5),
  ('Hamster Accessories', 'hamster-accessories', 'Hamster accessoires', '66666666-0000-0000-0000-000000000006', 6)
ON CONFLICT (slug) DO NOTHING;

-- Create RABBIT subcategories
INSERT INTO categories (name, slug, description, parent_id, display_order) VALUES
  ('Rabbit Hutches', 'rabbit-hutches', 'Konijnenhokken', '77777777-0000-0000-0000-000000000007', 1),
  ('Rabbit Beds & Houses', 'rabbit-beds-houses', 'Konijnenhuisjes en slaapplekken', '77777777-0000-0000-0000-000000000007', 2),
  ('Rabbit Toys', 'rabbit-toys', 'Speelgoed voor konijnen', '77777777-0000-0000-0000-000000000007', 3),
  ('Rabbit Food & Treats', 'rabbit-food-treats', 'Konijnenvoer en snacks', '77777777-0000-0000-0000-000000000007', 4),
  ('Rabbit Bowls & Feeders', 'rabbit-bowls-feeders', 'Voer- en drinkbakken voor konijnen', '77777777-0000-0000-0000-000000000007', 5),
  ('Rabbit Accessories', 'rabbit-accessories', 'Konijnen accessoires', '77777777-0000-0000-0000-000000000007', 6)
ON CONFLICT (slug) DO NOTHING;

-- Create GUINEA PIG subcategories
INSERT INTO categories (name, slug, description, parent_id, display_order) VALUES
  ('Guinea Pig Cages', 'guinea-pig-cages', 'Cavia kooien', '88888888-0000-0000-0000-000000000008', 1),
  ('Guinea Pig Beds & Houses', 'guinea-pig-beds-houses', 'Cavia huisjes en slaapplekken', '88888888-0000-0000-0000-000000000008', 2),
  ('Guinea Pig Toys', 'guinea-pig-toys', 'Speelgoed voor cavia''s', '88888888-0000-0000-0000-000000000008', 3),
  ('Guinea Pig Food & Treats', 'guinea-pig-food-treats', 'Cavia voer en snacks', '88888888-0000-0000-0000-000000000008', 4),
  ('Guinea Pig Accessories', 'guinea-pig-accessories', 'Cavia accessoires', '88888888-0000-0000-0000-000000000008', 5)
ON CONFLICT (slug) DO NOTHING;

-- Create REPTILE subcategories
INSERT INTO categories (name, slug, description, parent_id, display_order) VALUES
  ('Reptile Terrariums', 'reptile-terrariums', 'Terrariums voor reptielen', '99999999-0000-0000-0000-000000000009', 1),
  ('Reptile Heating', 'reptile-heating', 'Verwarming voor reptielen', '99999999-0000-0000-0000-000000000009', 2),
  ('Reptile Lighting', 'reptile-lighting', 'Verlichting voor reptielen', '99999999-0000-0000-0000-000000000009', 3),
  ('Reptile Food', 'reptile-food', 'Reptielenvoer', '99999999-0000-0000-0000-000000000009', 4),
  ('Reptile Decorations', 'reptile-decorations', 'Terrariumdecoratie', '99999999-0000-0000-0000-000000000009', 5),
  ('Reptile Accessories', 'reptile-accessories', 'Reptielen accessoires', '99999999-0000-0000-0000-000000000009', 6)
ON CONFLICT (slug) DO NOTHING;

-- Delete old generic subcategories that were under Dogs but should be animal-specific
DELETE FROM categories WHERE slug IN (
  'pet-beds', 'pet-houses', 'pet-toys', 'pet-bowls', 'pet-grooming', 
  'pet-training', 'pet-bags', 'pet-strollers', 'pet-gates-fences',
  'pet-collars-leashes', 'pet-drinking-tools', 'pet-feeding-tools',
  'pet-food-treats', 'pet-furniture', 'pet-hair-care', 'pet-hammocks',
  'pet-nests', 'pet-supplies', 'pet-accessories', 'pet-beds-mats',
  'dog-stairs-and-steps'
) AND id NOT IN (SELECT DISTINCT category_id FROM product_categories);
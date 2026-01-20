-- Verwijder de oude Pet Furniture categorie niet, we gebruiken hem als parent

-- Voeg subcategorieën toe voor Pet Furniture
INSERT INTO categories (name, slug, description, parent_id, image_url)
SELECT 'Pet Beds', 'pet-beds', 'Comfortable beds and mats for your pets', id, '/categories/houses.jpg'
FROM categories WHERE slug = 'pet-furniture';

INSERT INTO categories (name, slug, description, parent_id, image_url)
SELECT 'Pet Houses', 'pet-houses', 'Cozy houses and shelters for pets', id, '/categories/houses.jpg'
FROM categories WHERE slug = 'pet-furniture';

INSERT INTO categories (name, slug, description, parent_id, image_url)
SELECT 'Pet Hammocks', 'pet-hammocks', 'Hanging hammocks and elevated beds', id, '/categories/hammocks.jpg'
FROM categories WHERE slug = 'pet-furniture';

INSERT INTO categories (name, slug, description, parent_id, image_url)
SELECT 'Pet Nests', 'pet-nests', 'Warm nests and enclosed beds for small pets', id, '/categories/nests.jpg'
FROM categories WHERE slug = 'pet-furniture';

-- Voeg nieuwe hoofdcategorieën toe
INSERT INTO categories (name, slug, description, image_url)
VALUES 
  ('Bird Cages', 'bird-cages', 'Cages and enclosures for birds', '/categories/bird-supplies.jpg'),
  ('Pet Hair Care', 'pet-hair-care', 'Brushes, combs and hair removal tools', '/categories/grooming.jpg');

-- Voeg subcategorieën toe voor Bird Supplies
INSERT INTO categories (name, slug, description, parent_id, image_url)
SELECT 'Bird Feeders', 'bird-feeders', 'Feeders and food dishes for birds', id, '/categories/bird-supplies.jpg'
FROM categories WHERE slug = 'bird-supplies';

INSERT INTO categories (name, slug, description, parent_id, image_url)
SELECT 'Bird Toys', 'bird-toys', 'Toys and enrichment for birds', id, '/categories/bird-supplies.jpg'
FROM categories WHERE slug = 'bird-supplies';
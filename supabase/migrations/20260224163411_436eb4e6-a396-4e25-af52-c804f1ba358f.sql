
-- Add seo_tier column to products table
-- Tier A = Core SEO (indexed, core sitemap)
-- Tier B = Support Commercial (indexed, secondary sitemap)  
-- Tier C = Low-value (noindex, no sitemap)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS seo_tier TEXT NOT NULL DEFAULT 'C';

-- Create index for fast tier filtering
CREATE INDEX IF NOT EXISTS idx_products_seo_tier ON public.products(seo_tier);

-- TIER A: Cat Trees & Condos, Guinea Pig/Hamster/Rabbit Cages, high-value structural items
UPDATE public.products SET seo_tier = 'A' WHERE is_active = true AND (
  category IN ('Cat Trees & Condos', 'Hamster Cages', 'Rabbit Cages', 'Bird Cages', 'Reptile Terrariums')
  OR category IN ('Dog Beds', 'Cat Litter Boxes', 'Dog Houses', 'Cat Houses', 'Dog Carriers', 'Cat Carriers')
  OR (price > 100 AND category IN ('Cat Furniture', 'Cat Scratching Posts', 'Pet Houses', 'Pet Houses & Cages'))
);

-- TIER B: Accessories related to core categories + mid-value items
UPDATE public.products SET seo_tier = 'B' WHERE seo_tier = 'C' AND is_active = true AND (
  category IN ('Cat Scratching Posts', 'Cat Beds', 'Cat Furniture', 'Dog Training', 'Dog Bowls & Feeders', 'Cat Bowls & Feeders')
  OR category IN ('Dog Food & Treats', 'Dog Grooming', 'Cat Grooming', 'Dog Toys', 'Cat Toys')
  OR (price > 80)
);

-- Everything else stays Tier C (default): bandanas, generic collars, basic bowls, etc.
-- Tier C includes: Pet Collars, Pet Shoes & Socks, Pet Plush Toys, Pet Chase Toys,
-- Pet Mats, Pet Training Toys, Bird accessories, pet-supplies generic, low-price items

-- Also expose seo_tier in the products_public view if it exists
-- First check what the view looks like

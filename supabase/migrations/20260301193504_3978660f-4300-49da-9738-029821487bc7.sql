-- Add species and intent columns to products table
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS primary_species text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS primary_intent text DEFAULT 'general';

-- Auto-classify existing products based on name/category
UPDATE public.products SET primary_species = CASE
  WHEN (lower(name) || ' ' || lower(coalesce(category,''))) ~ '\y(cat|kitten|feline)\y' 
    AND (lower(name) || ' ' || lower(coalesce(category,''))) ~ '\y(dog|puppy|canine)\y' THEN 'both'
  WHEN (lower(name) || ' ' || lower(coalesce(category,''))) ~ '\y(cat|kitten|feline|litter|scratching post|cat tree)\y' THEN 'cat'
  WHEN (lower(name) || ' ' || lower(coalesce(category,''))) ~ '\y(dog|puppy|canine|leash|harness|bark|potty|crate)\y' THEN 'dog'
  WHEN (lower(name) || ' ' || lower(coalesce(category,''))) ~ '\y(pet|animal)\y' THEN 'both'
  ELSE 'unknown'
END;

UPDATE public.products SET primary_intent = CASE
  WHEN (lower(name) || ' ' || lower(coalesce(category,''))) ~ '\y(training|leash|harness|potty|bark|clicker|treat pouch|crate|no.pull|head collar)\y' THEN 'training'
  WHEN (lower(name) || ' ' || lower(coalesce(category,''))) ~ '\y(carrier|travel|car seat|stroller|backpack)\y' THEN 'travel'
  WHEN (lower(name) || ' ' || lower(coalesce(category,''))) ~ '\y(collar|lead|walking|reflective)\y' THEN 'walking'
  WHEN (lower(name) || ' ' || lower(coalesce(category,''))) ~ '\y(groom|brush|shampoo|nail|bath)\y' THEN 'grooming'
  WHEN (lower(name) || ' ' || lower(coalesce(category,''))) ~ '\y(toy|ball|chew|squeaky|interactive)\y' THEN 'toys'
  WHEN (lower(name) || ' ' || lower(coalesce(category,''))) ~ '\y(bed|blanket|mat|cushion)\y' THEN 'comfort'
  WHEN (lower(name) || ' ' || lower(coalesce(category,''))) ~ '\y(bowl|feeder|fountain|food)\y' THEN 'feeding'
  WHEN (lower(name) || ' ' || lower(coalesce(category,''))) ~ '\y(litter|scratching|cat tree|condo)\y' THEN 'furniture'
  ELSE 'general'
END;
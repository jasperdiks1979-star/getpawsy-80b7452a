
-- Add cluster taxonomy fields to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS cluster_primary text,
ADD COLUMN IF NOT EXISTS cluster_secondary text;

-- Add cluster taxonomy field to blog_posts table  
ALTER TABLE public.blog_posts
ADD COLUMN IF NOT EXISTS cluster_primary text,
ADD COLUMN IF NOT EXISTS cluster_secondary text;

-- Create index for efficient cluster queries
CREATE INDEX IF NOT EXISTS idx_products_cluster_primary ON public.products (cluster_primary) WHERE cluster_primary IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_cluster_secondary ON public.products (cluster_secondary) WHERE cluster_secondary IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_cluster_primary ON public.blog_posts (cluster_primary) WHERE cluster_primary IS NOT NULL;

-- Add constraint to validate cluster values
ALTER TABLE public.products ADD CONSTRAINT valid_cluster_primary 
  CHECK (cluster_primary IS NULL OR cluster_primary IN ('dog-training-behavior', 'dog-comfort-recovery', 'cat-enrichment-furniture', 'cat-hygiene-litter'));
ALTER TABLE public.products ADD CONSTRAINT valid_cluster_secondary
  CHECK (cluster_secondary IS NULL OR cluster_secondary IN ('dog-training-behavior', 'dog-comfort-recovery', 'cat-enrichment-furniture', 'cat-hygiene-litter'));
ALTER TABLE public.blog_posts ADD CONSTRAINT valid_blog_cluster_primary
  CHECK (cluster_primary IS NULL OR cluster_primary IN ('dog-training-behavior', 'dog-comfort-recovery', 'cat-enrichment-furniture', 'cat-hygiene-litter'));
ALTER TABLE public.blog_posts ADD CONSTRAINT valid_blog_cluster_secondary
  CHECK (cluster_secondary IS NULL OR cluster_secondary IN ('dog-training-behavior', 'dog-comfort-recovery', 'cat-enrichment-furniture', 'cat-hygiene-litter'));

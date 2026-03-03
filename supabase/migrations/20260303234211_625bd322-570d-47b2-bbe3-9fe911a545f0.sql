ALTER TABLE public.shopping_optimizations 
ADD COLUMN IF NOT EXISTS boost_score integer DEFAULT 0;
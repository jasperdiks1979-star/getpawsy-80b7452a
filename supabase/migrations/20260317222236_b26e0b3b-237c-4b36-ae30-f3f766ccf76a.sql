
-- Add optimizer PRO columns to products table (only if not existing)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS benefit_angle text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS conversion_angle text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS keyword_cluster text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS slug_suggestion text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS shopping_priority_score numeric;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS content_readiness_score numeric;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS feed_readiness_score numeric;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_optimizer_status text DEFAULT 'pending';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_optimizer_error text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_optimizer_version text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_last_optimized_at timestamptz;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_last_preview_at timestamptz;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_locked boolean DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ai_manual_override boolean DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS seo_title text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS seo_meta_description text;

-- Create optimizer_runs table
CREATE TABLE IF NOT EXISTS public.optimizer_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'preview',
  trigger_source text DEFAULT 'admin',
  total_products integer DEFAULT 0,
  success_count integer DEFAULT 0,
  error_count integer DEFAULT 0,
  fallback_count integer DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  initiated_by uuid,
  version text DEFAULT 'v2',
  notes text,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create optimizer_run_items table
CREATE TABLE IF NOT EXISTS public.optimizer_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.optimizer_runs(id) ON DELETE CASCADE NOT NULL,
  product_id uuid NOT NULL,
  status text DEFAULT 'pending',
  before_snapshot jsonb,
  after_snapshot jsonb,
  error_message text,
  used_ai boolean DEFAULT false,
  used_fallback boolean DEFAULT false,
  scores jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.optimizer_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.optimizer_run_items ENABLE ROW LEVEL SECURITY;

-- RLS policies - admin only access
CREATE POLICY "Admin can manage optimizer_runs" ON public.optimizer_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can manage optimizer_run_items" ON public.optimizer_run_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_optimizer_run_items_run_id ON public.optimizer_run_items(run_id);
CREATE INDEX IF NOT EXISTS idx_optimizer_run_items_product_id ON public.optimizer_run_items(product_id);
CREATE INDEX IF NOT EXISTS idx_optimizer_runs_started_at ON public.optimizer_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_ai_optimizer_status ON public.products(ai_optimizer_status);
CREATE INDEX IF NOT EXISTS idx_products_ai_locked ON public.products(ai_locked);

-- Add indexes on orders table for faster co-purchase queries

-- Index for filtering by status (used in co-purchase analysis)
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);

-- Index for filtering by created_at (time-based queries)
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- Composite index for common query pattern: status + created_at
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON public.orders(status, created_at DESC);

-- GIN index on items JSONB for faster JSON operations
CREATE INDEX IF NOT EXISTS idx_orders_items_gin ON public.orders USING GIN(items);

-- Index on user_id for user-specific order queries
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id) WHERE user_id IS NOT NULL;

-- Index on customer_email for guest order lookups
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON public.orders(customer_email) WHERE customer_email IS NOT NULL;

-- Add indexes on products table for faster related product queries
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category) WHERE is_active = true;

-- Composite index for active products sorted by created_at
CREATE INDEX IF NOT EXISTS idx_products_active_created ON public.products(is_active, created_at DESC) WHERE is_active = true;

-- Index on product slug for faster URL lookups
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug) WHERE slug IS NOT NULL;
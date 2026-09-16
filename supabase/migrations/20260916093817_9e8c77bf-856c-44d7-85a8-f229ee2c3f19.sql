create index if not exists idx_products_active_created_at
  on public.products (created_at desc)
  where is_active;
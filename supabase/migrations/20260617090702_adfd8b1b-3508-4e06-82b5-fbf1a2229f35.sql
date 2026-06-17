CREATE UNIQUE INDEX IF NOT EXISTS pinterest_loser_blocklist_slug_uniq
  ON public.pinterest_loser_blocklist (product_slug)
  WHERE product_slug IS NOT NULL AND asset_id IS NULL AND hook_variant IS NULL;

CREATE INDEX IF NOT EXISTS pinterest_loser_blocklist_active_idx
  ON public.pinterest_loser_blocklist (product_slug, blocked_until DESC);
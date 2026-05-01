CREATE TABLE IF NOT EXISTS public.stock_refresh_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT 'bulk-reactivate',
  total_initial integer NOT NULL,
  remaining integer NOT NULL,
  synced_ok integer NOT NULL DEFAULT 0,
  synced_error integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  notified_complete_at timestamptz,
  notes jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.stock_refresh_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view stock refresh runs"
  ON public.stock_refresh_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed one run with the current pending_refresh count (= 263 from earlier bulk reactivation)
INSERT INTO public.stock_refresh_runs (label, total_initial, remaining)
SELECT 
  'bulk-reactivate-2026-05-01',
  COUNT(*)::int,
  COUNT(*)::int
FROM products
WHERE stock_sync_status = 'pending_refresh'
  AND COALESCE(is_duplicate, false) = false
ON CONFLICT DO NOTHING;
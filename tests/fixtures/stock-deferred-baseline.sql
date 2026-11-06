-- Test-only baseline: public.stock_sync_deferred before worker lease columns.
-- Column defaults and constraints inspected read-only on 2026-11-04.
CREATE TABLE public.stock_sync_deferred (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  next_attempt_at timestamptz,
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 3),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','exhausted','resolved')),
  last_offset integer NOT NULL CHECK (last_offset >= 0),
  reason text NOT NULL CHECK (reason = 'no_data'),
  message text NOT NULL DEFAULT '',
  resolved_at timestamptz
);
ALTER TABLE public.stock_sync_deferred ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_sync_deferred FROM PUBLIC, anon, authenticated;

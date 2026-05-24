
-- Phase 1/3: Cleanup scan sessions for chunked resumable processing
CREATE TABLE IF NOT EXISTS public.pinterest_cleanup_scan_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','paused','completed','failed')),
  cursor text,
  processed_count integer NOT NULL DEFAULT 0,
  remaining_count integer,
  total_estimate integer,
  last_error text,
  mode text NOT NULL DEFAULT 'light' CHECK (mode IN ('light','full')),
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  partial_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  api_calls_used integer NOT NULL DEFAULT 0,
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cleanup_scan_sessions_status ON public.pinterest_cleanup_scan_sessions (status, started_at DESC);

ALTER TABLE public.pinterest_cleanup_scan_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage cleanup scan sessions" ON public.pinterest_cleanup_scan_sessions;
CREATE POLICY "Admins manage cleanup scan sessions"
  ON public.pinterest_cleanup_scan_sessions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Phase 5: Publish caps for premium pivot
ALTER TABLE public.cinematic_ad_settings
  ADD COLUMN IF NOT EXISTS pinterest_publish_max_per_day integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS pinterest_publish_premium_cap_per_hour integer NOT NULL DEFAULT 2;

-- Unified function log for Pinterest video pipeline (discovery, publisher, metrics-sync).
-- Each row carries a correlation trace_id and optional queue_id / asset_id so admins
-- can drill from a failed video job to every line emitted across functions.
CREATE TABLE IF NOT EXISTS public.pinterest_video_function_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  trace_id text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  payload jsonb,
  queue_id uuid,
  asset_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pvfl_created_idx     ON public.pinterest_video_function_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS pvfl_trace_idx       ON public.pinterest_video_function_logs (trace_id);
CREATE INDEX IF NOT EXISTS pvfl_queue_idx       ON public.pinterest_video_function_logs (queue_id);
CREATE INDEX IF NOT EXISTS pvfl_function_idx    ON public.pinterest_video_function_logs (function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS pvfl_level_idx       ON public.pinterest_video_function_logs (level);

ALTER TABLE public.pinterest_video_function_logs ENABLE ROW LEVEL SECURITY;

-- Admin-only read (insert happens via service role from edge functions).
CREATE POLICY "Admins can read pv function logs"
  ON public.pinterest_video_function_logs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Auto-prune logs older than 30 days to keep the table light.
CREATE OR REPLACE FUNCTION public.prune_pinterest_video_function_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.pinterest_video_function_logs
  WHERE created_at < now() - interval '30 days';
END;
$$;
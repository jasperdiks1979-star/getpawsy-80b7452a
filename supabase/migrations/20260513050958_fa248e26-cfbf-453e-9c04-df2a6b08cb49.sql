-- Pinterest video cover image columns
ALTER TABLE public.pinterest_video_assets
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS cover_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS key_frame_second numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS thumbnail_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS cover_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cover_last_error text,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS cover_score jsonb;

-- Profit Engine diagnostics log
CREATE TABLE IF NOT EXISTS public.profit_engine_function_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id uuid NOT NULL,
  function_name text NOT NULL,
  phase text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  message text,
  payload jsonb,
  duration_ms integer,
  rows_processed integer,
  scoring_source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profit_engine_function_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read profit engine logs"
  ON public.profit_engine_function_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_pe_logs_created ON public.profit_engine_function_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pe_logs_trace ON public.profit_engine_function_logs (trace_id);

CREATE TABLE IF NOT EXISTS public.pinterest_recovery_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_pin_id uuid,
  product_slug text NOT NULL,
  board_id text,
  board_name text,
  pin_image_url text NOT NULL,
  pin_image_phash text,
  original_rejection_reason text,
  external_url text,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pinterest_recovery_queue_status_idx ON public.pinterest_recovery_queue (status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS pinterest_recovery_queue_source_uniq ON public.pinterest_recovery_queue (source_pin_id) WHERE source_pin_id IS NOT NULL;

GRANT SELECT ON public.pinterest_recovery_queue TO authenticated;
GRANT ALL ON public.pinterest_recovery_queue TO service_role;

ALTER TABLE public.pinterest_recovery_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read recovery queue" ON public.pinterest_recovery_queue
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service manages recovery queue" ON public.pinterest_recovery_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_pinterest_recovery_queue_updated_at
  BEFORE UPDATE ON public.pinterest_recovery_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.pinterest_recovery_queue
  (source_pin_id, product_slug, board_id, board_name, pin_image_url, pin_image_phash, original_rejection_reason, external_url)
SELECT q.id, q.product_slug, q.board_id, q.board_name, q.pin_image_url, q.pin_image_phash,
       COALESCE(q.rejection_reason, 'unspecified'), COALESCE(q.final_resolved_url, q.external_url)
FROM public.pinterest_pin_queue q
WHERE q.created_at > now() - interval '72 hours'
  AND q.status IN ('rejected','skipped')
  AND q.pin_image_url IS NOT NULL AND q.pin_image_url <> ''
  AND (q.rejection_reason IS NULL OR q.rejection_reason IN ('creative_mismatch','governor:max_per_board_per_slug','integrity_guard_blocked'))
  AND NOT EXISTS (
    SELECT 1 FROM public.pinterest_loser_blocklist b
    WHERE b.product_slug = q.product_slug AND b.blocked_until > now()
  );


CREATE TABLE IF NOT EXISTS public.product_media_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_slug text NOT NULL,
  product_name text NOT NULL,
  product_category text,
  image_url text NOT NULL,
  image_position integer NOT NULL DEFAULT 0,
  expected_subject text,
  detected_subject text,
  detected_species text,
  matches_title boolean,
  mismatch_reason text,
  confidence numeric(4,3),
  severity text CHECK (severity IN ('critical','high','medium','low','ok')),
  model text,
  raw_response jsonb,
  audit_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_media_audit_run_idx ON public.product_media_audit(audit_run_id);
CREATE INDEX IF NOT EXISTS product_media_audit_product_idx ON public.product_media_audit(product_id);
CREATE INDEX IF NOT EXISTS product_media_audit_severity_idx ON public.product_media_audit(severity) WHERE severity IN ('critical','high');

GRANT SELECT ON public.product_media_audit TO authenticated;
GRANT ALL ON public.product_media_audit TO service_role;

ALTER TABLE public.product_media_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read media audit"
  ON public.product_media_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.product_media_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  total_products integer NOT NULL DEFAULT 0,
  processed_products integer NOT NULL DEFAULT 0,
  mismatches integer NOT NULL DEFAULT 0,
  critical_count integer NOT NULL DEFAULT 0,
  high_count integer NOT NULL DEFAULT 0,
  medium_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','complete','failed')),
  notes text
);

GRANT SELECT ON public.product_media_audit_runs TO authenticated;
GRANT ALL ON public.product_media_audit_runs TO service_role;

ALTER TABLE public.product_media_audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read media audit runs"
  ON public.product_media_audit_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

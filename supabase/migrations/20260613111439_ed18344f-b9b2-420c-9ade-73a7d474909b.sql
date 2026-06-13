
-- 1. media_audit table
CREATE TABLE IF NOT EXISTS public.media_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  issue_type text NOT NULL DEFAULT 'none',
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'REVIEW' CHECK (status IN ('CLEAN','REVIEW','BLOCKED')),
  detected_languages text[] NOT NULL DEFAULT '{}',
  scan_model text,
  scan_notes text,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, image_url)
);

CREATE INDEX IF NOT EXISTS media_audit_product_idx ON public.media_audit(product_id);
CREATE INDEX IF NOT EXISTS media_audit_status_idx ON public.media_audit(status);
CREATE INDEX IF NOT EXISTS media_audit_scanned_at_idx ON public.media_audit(scanned_at DESC);

GRANT SELECT ON public.media_audit TO authenticated;
GRANT ALL ON public.media_audit TO service_role;

ALTER TABLE public.media_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read media_audit"
ON public.media_audit FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages media_audit"
ON public.media_audit FOR ALL
TO service_role
USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tg_media_audit_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS media_audit_touch ON public.media_audit;
CREATE TRIGGER media_audit_touch BEFORE UPDATE ON public.media_audit
FOR EACH ROW EXECUTE FUNCTION public.tg_media_audit_touch();

-- 2. pinterest_eligible flag
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pinterest_eligible boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS products_pinterest_eligible_idx
  ON public.products(pinterest_eligible) WHERE pinterest_eligible = false;

-- 3. media_audit_runs
CREATE TABLE IF NOT EXISTS public.media_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL DEFAULT 'manual',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  images_scanned int NOT NULL DEFAULT 0,
  clean_count int NOT NULL DEFAULT 0,
  review_count int NOT NULL DEFAULT 0,
  blocked_count int NOT NULL DEFAULT 0,
  errors int NOT NULL DEFAULT 0,
  products_excluded int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.media_audit_runs TO authenticated;
GRANT ALL ON public.media_audit_runs TO service_role;

ALTER TABLE public.media_audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read media_audit_runs"
ON public.media_audit_runs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages media_audit_runs"
ON public.media_audit_runs FOR ALL
TO service_role
USING (true) WITH CHECK (true);

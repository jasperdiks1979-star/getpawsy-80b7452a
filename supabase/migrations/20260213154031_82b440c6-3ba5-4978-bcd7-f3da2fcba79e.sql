
-- Table to track service account credentials and their rotation status
CREATE TABLE public.service_account_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_name TEXT NOT NULL,
  account_email TEXT NOT NULL,
  service_description TEXT,
  key_id TEXT,
  iam_roles TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  key_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_rotated_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  rotation_status TEXT NOT NULL DEFAULT 'healthy' CHECK (rotation_status IN ('healthy', 'warning', 'critical', 'rotating')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table to log all rotation events
CREATE TABLE public.key_rotation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_account_key_id UUID REFERENCES public.service_account_keys(id) ON DELETE CASCADE,
  account_name TEXT NOT NULL,
  old_key_id TEXT,
  new_key_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('created', 'validated', 'revoked', 'rotation_started', 'rotation_completed', 'rotation_failed')),
  performed_by TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.service_account_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_rotation_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can access
CREATE POLICY "Admins can manage service account keys"
ON public.service_account_keys FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage rotation logs"
ON public.key_rotation_logs FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Timestamp trigger
CREATE TRIGGER update_service_account_keys_updated_at
BEFORE UPDATE ON public.service_account_keys
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed with known service accounts
INSERT INTO public.service_account_keys (account_name, account_email, service_description, iam_roles, key_created_at)
VALUES
  ('GSC Sync Service Account', 'gsc-sync@getpawsy.iam.gserviceaccount.com', 'Google Search Console API - daily keyword sync', ARRAY['roles/webmasters.readonly'], now() - interval '30 days'),
  ('GA4 Analytics Service Account', 'ga4-analytics@getpawsy.iam.gserviceaccount.com', 'Google Analytics 4 - daily snapshot sync', ARRAY['roles/analytics.viewer'], now() - interval '30 days');

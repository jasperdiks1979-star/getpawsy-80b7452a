
-- Track TikTok sandbox/test users (registered in the TikTok Developer Portal)
-- and which one is the active "recording test user".
CREATE TABLE IF NOT EXISTS public.tiktok_test_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  open_id text NOT NULL UNIQUE,
  label text,
  notes text,
  is_recording_user boolean NOT NULL DEFAULT false,
  registered_in_dev_portal_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one recording user at a time
CREATE UNIQUE INDEX IF NOT EXISTS tiktok_test_users_one_recording
  ON public.tiktok_test_users (is_recording_user)
  WHERE is_recording_user = true;

ALTER TABLE public.tiktok_test_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view test users"
  ON public.tiktok_test_users FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert test users"
  ON public.tiktok_test_users FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update test users"
  ON public.tiktok_test_users FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete test users"
  ON public.tiktok_test_users FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER tiktok_test_users_updated_at
  BEFORE UPDATE ON public.tiktok_test_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

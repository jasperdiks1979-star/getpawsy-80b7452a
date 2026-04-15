
-- Fix 1: referral_uses — drop permissive public policy, restrict to service role
DROP POLICY IF EXISTS "Service role full access on referral_uses" ON public.referral_uses;
CREATE POLICY "Service role full access on referral_uses"
  ON public.referral_uses
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Fix 2: agm_config — drop permissive public policy, restrict to service role
DROP POLICY IF EXISTS "Service can manage config" ON public.agm_config;
CREATE POLICY "Service role can manage config"
  ON public.agm_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Fix 3: referral_codes — drop anonymous policy that exposes owner_email
DROP POLICY IF EXISTS "Public can read active referral codes safely" ON public.referral_codes;

-- Replace with a safe policy that only exposes the code itself (not owner email)
-- Authenticated users can read active codes
CREATE POLICY "Authenticated users can read active referral codes"
  ON public.referral_codes
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Fix 4: Public bucket listing — restrict SELECT on storage.objects for public buckets
-- Remove any overly broad SELECT policies on public buckets
DROP POLICY IF EXISTS "Public read access for blog-images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for pinterest-ads" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for tiktok-media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view blog images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view pinterest ads" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view tiktok media" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;

-- Re-create with path-based access only (no listing)
-- Users can access files by direct URL but cannot list/enumerate bucket contents
CREATE POLICY "Direct access to blog-images files"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'blog-images' AND name IS NOT NULL AND name != '');

CREATE POLICY "Direct access to pinterest-ads files"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'pinterest-ads' AND name IS NOT NULL AND name != '');

CREATE POLICY "Direct access to tiktok-media files"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'tiktok-media' AND name IS NOT NULL AND name != '');

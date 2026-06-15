
-- Pinterest OAuth tokens: remove admin ALL (which grants SELECT of tokens). Service role retains full access via auth.role() bypass.
DROP POLICY IF EXISTS "Admins can manage pinterest connection" ON public.pinterest_connection;
CREATE POLICY "Service role manages pinterest connection"
  ON public.pinterest_connection FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- TikTok OAuth tokens: remove admin SELECT exposure
DROP POLICY IF EXISTS "Admins can view tiktok tokens" ON public.tiktok_oauth_tokens;
DROP POLICY IF EXISTS "Admins can delete tiktok tokens" ON public.tiktok_oauth_tokens;
CREATE POLICY "Service role manages tiktok oauth tokens"
  ON public.tiktok_oauth_tokens FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Orders: tighten admin update to authenticated role
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
CREATE POLICY "Admins can update orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Cinematic ad style presets: restrict reads to admins
DROP POLICY IF EXISTS "Style presets readable by authenticated" ON public.cinematic_ad_style_presets;
CREATE POLICY "Style presets readable by admins"
  ON public.cinematic_ad_style_presets FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- mi_arm_revenue: restrict reads to admins
DROP POLICY IF EXISTS "mi_arm_revenue read all" ON public.mi_arm_revenue;
CREATE POLICY "mi_arm_revenue admins read"
  ON public.mi_arm_revenue FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- mi_audience_clusters: restrict reads to admins
DROP POLICY IF EXISTS "mi_audience_clusters read all" ON public.mi_audience_clusters;
CREATE POLICY "mi_audience_clusters admins read"
  ON public.mi_audience_clusters FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

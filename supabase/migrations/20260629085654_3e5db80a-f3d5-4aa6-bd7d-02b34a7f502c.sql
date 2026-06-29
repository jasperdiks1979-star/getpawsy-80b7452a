-- Tighten RLS on CIE incident-related tables and add explicit service_role insert policies
-- so edge functions can audit GA4 / mapping failures even if RLS is hardened.

-- cie_incidents: keep admin ALL, add explicit service_role INSERT/SELECT, deny anon.
DROP POLICY IF EXISTS cie_inc_service_write ON public.cie_incidents;
CREATE POLICY cie_inc_service_write ON public.cie_incidents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.cie_incidents FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cie_incidents TO authenticated;
GRANT ALL ON public.cie_incidents TO service_role;

-- cie_events: ensure service_role can always write evidence rows
DROP POLICY IF EXISTS cie_events_service_write ON public.cie_events;
CREATE POLICY cie_events_service_write ON public.cie_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.cie_events FROM anon;
GRANT SELECT, INSERT ON public.cie_events TO authenticated;
GRANT ALL ON public.cie_events TO service_role;

-- cie_confidence_scores: same hardening
DROP POLICY IF EXISTS cie_conf_service_write ON public.cie_confidence_scores;
CREATE POLICY cie_conf_service_write ON public.cie_confidence_scores
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.cie_confidence_scores FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.cie_confidence_scores TO authenticated;
GRANT ALL ON public.cie_confidence_scores TO service_role;

-- Helpful index for the dashboard's "open incidents" view
CREATE INDEX IF NOT EXISTS cie_incidents_open_idx
  ON public.cie_incidents (status, opened_at DESC)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS cie_incidents_category_idx
  ON public.cie_incidents (category, opened_at DESC);
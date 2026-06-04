
-- Replace public-scoped service policies with service_role-scoped policies.

-- 1. replenishment_reminders
DROP POLICY IF EXISTS "Service role full access on replenishment_reminders" ON public.replenishment_reminders;
CREATE POLICY "Service role full access on replenishment_reminders"
  ON public.replenishment_reminders
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 2. agm_impact_tracking
DROP POLICY IF EXISTS "Service can manage impact" ON public.agm_impact_tracking;
CREATE POLICY "Service can manage impact"
  ON public.agm_impact_tracking
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 3. agm_opportunity_edges
DROP POLICY IF EXISTS "Service can insert edges" ON public.agm_opportunity_edges;
-- existing 'service_role insert agm_opportunity_edges' policy remains.

-- 4. agm_playbook_history
DROP POLICY IF EXISTS "Service can manage playbook" ON public.agm_playbook_history;
CREATE POLICY "Service can manage playbook"
  ON public.agm_playbook_history
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 5. keyword_clusters
DROP POLICY IF EXISTS "Service write keyword_clusters" ON public.keyword_clusters;
CREATE POLICY "Service write keyword_clusters"
  ON public.keyword_clusters
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 6. marketing_jobs
DROP POLICY IF EXISTS "Service manage marketing_jobs" ON public.marketing_jobs;
CREATE POLICY "Service manage marketing_jobs"
  ON public.marketing_jobs
  AS PERMISSIVE FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 7. stock_sync_logs
DROP POLICY IF EXISTS "Service role can insert stock sync logs" ON public.stock_sync_logs;
CREATE POLICY "Service role can insert stock sync logs"
  ON public.stock_sync_logs
  AS PERMISSIVE FOR INSERT
  TO service_role
  WITH CHECK (true);

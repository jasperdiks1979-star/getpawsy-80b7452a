
-- ============================================================
-- Helper: drop any public policy with a given name across many tables
-- Using individual DROP IF EXISTS keeps this idempotent.
-- ============================================================

-- ---------- agm_actions ----------
DROP POLICY IF EXISTS "Service can insert actions" ON public.agm_actions;
DROP POLICY IF EXISTS "Service can update actions" ON public.agm_actions;
CREATE POLICY "service_role insert agm_actions"
  ON public.agm_actions FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role update agm_actions"
  ON public.agm_actions FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ---------- agm_opportunity_nodes ----------
DROP POLICY IF EXISTS "Service can insert opportunity nodes" ON public.agm_opportunity_nodes;
DROP POLICY IF EXISTS "Service can update opportunity nodes" ON public.agm_opportunity_nodes;
CREATE POLICY "service_role insert agm_opportunity_nodes"
  ON public.agm_opportunity_nodes FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "service_role update agm_opportunity_nodes"
  ON public.agm_opportunity_nodes FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ---------- agm_opportunity_edges ----------
DROP POLICY IF EXISTS "Service can insert opportunity edges" ON public.agm_opportunity_edges;
CREATE POLICY "service_role insert agm_opportunity_edges"
  ON public.agm_opportunity_edges FOR INSERT TO service_role WITH CHECK (true);

-- ---------- agm_impact_tracking ----------
DROP POLICY IF EXISTS "Service can manage impact tracking" ON public.agm_impact_tracking;
DROP POLICY IF EXISTS "Service can insert impact tracking" ON public.agm_impact_tracking;
DROP POLICY IF EXISTS "Service can update impact tracking" ON public.agm_impact_tracking;
CREATE POLICY "service_role manage agm_impact_tracking"
  ON public.agm_impact_tracking FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------- sessions: restrict UPDATE ----------
DROP POLICY IF EXISTS "Anyone can update sessions" ON public.sessions;
-- Only service_role (edge functions) may update session records. Client-side
-- session enrichment continues to happen via the existing INSERT path and
-- through edge functions, not direct anon UPDATE.
CREATE POLICY "service_role update sessions"
  ON public.sessions FOR UPDATE TO service_role USING (true) WITH CHECK (true);

-- ---------- job_retry_policies: restrict SELECT ----------
DROP POLICY IF EXISTS "Service reads job_retry_policies" ON public.job_retry_policies;
CREATE POLICY "service_role read job_retry_policies"
  ON public.job_retry_policies FOR SELECT TO service_role USING (true);

-- ---------- Bulk: SEO/intelligence/analytics public INSERT tables ----------
DO $$
DECLARE
  tbl text;
  pol record;
  tables text[] := ARRAY[
    'ranking_deltas',
    'seo_revenue_matrix',
    'market_share_simulations',
    'serp_features',
    'competitor_gaps',
    'competitor_content_intelligence',
    'backlink_outreach_scores',
    'strategy_state_history',
    'zero_click_pages',
    'sitemap_ping_log',
    'guide_generation_log',
    'marketing_events',
    'governor_decision_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    -- Skip if table doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      CONTINUE;
    END IF;

    -- Drop every existing policy that applies to {public} role (anon/authenticated)
    -- and is an INSERT or UPDATE policy. Admin/service_role policies are kept.
    FOR pol IN
      SELECT policyname, cmd, roles
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND cmd IN ('INSERT', 'UPDATE', 'ALL')
        AND (
          'public' = ANY(roles)
          OR 'anon' = ANY(roles)
          OR 'authenticated' = ANY(roles)
        )
        AND policyname ILIKE 'Service%'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
    END LOOP;

    -- Recreate a single service_role-scoped manage-all policy
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      'service_role manage ' || tbl,
      tbl
    );
  END LOOP;
END $$;

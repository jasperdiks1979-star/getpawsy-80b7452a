
-- Pinterest Enterprise Control Center: full schema (waves 1-5)
-- All tables admin-only via has_role, with service_role grants.

-- Wave 1
CREATE TABLE public.pe_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  full_access boolean NOT NULL DEFAULT false,
  oauth_status text,
  token_expires_at timestamptz,
  scopes_granted text[] DEFAULT '{}',
  scopes_missing text[] DEFAULT '{}',
  organic_health text,
  ads_health text,
  catalog_health text,
  tracking_health text,
  billing_health text,
  alert_count int DEFAULT 0,
  raw jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.pe_health_snapshots TO authenticated;
GRANT ALL ON public.pe_health_snapshots TO service_role;
ALTER TABLE public.pe_health_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_health" ON public.pe_health_snapshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pe_scope_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  scope text NOT NULL,
  granted boolean NOT NULL,
  required boolean NOT NULL DEFAULT true,
  note text
);
GRANT SELECT ON public.pe_scope_status TO authenticated;
GRANT ALL ON public.pe_scope_status TO service_role;
ALTER TABLE public.pe_scope_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_scope" ON public.pe_scope_status FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pe_endpoint_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  area text NOT NULL,           -- organic|ads|catalog|billing|tracking
  endpoint text NOT NULL,
  http_code int,
  ok boolean NOT NULL DEFAULT false,
  required_scope text,
  missing_scope text,
  root_cause text,
  fix text,
  auto_fixable boolean DEFAULT false,
  raw jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.pe_endpoint_checks TO authenticated;
GRANT ALL ON public.pe_endpoint_checks TO service_role;
ALTER TABLE public.pe_endpoint_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_endpoint" ON public.pe_endpoint_checks FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pe_oauth_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL,
  requested_scopes text[] NOT NULL DEFAULT '{}',
  completed_at timestamptz,
  granted_scopes text[] DEFAULT '{}'
);
GRANT SELECT ON public.pe_oauth_intents TO authenticated;
GRANT ALL ON public.pe_oauth_intents TO service_role;
ALTER TABLE public.pe_oauth_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_oauth_intents" ON public.pe_oauth_intents FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pe_issue_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  area text NOT NULL,
  severity text NOT NULL,        -- CRITICAL|HIGH|MEDIUM|LOW|INFO
  root_cause text,
  evidence jsonb DEFAULT '{}'::jsonb,
  affected_entity_type text,
  affected_entity_id text,
  api_response jsonb,
  auto_fixable boolean DEFAULT false,
  recommended_fix text,
  manual_action text,
  expected_impact text,
  status text NOT NULL DEFAULT 'open'  -- open|resolved|queued|fixed
);
GRANT SELECT ON public.pe_issue_log TO authenticated;
GRANT ALL ON public.pe_issue_log TO service_role;
ALTER TABLE public.pe_issue_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_issue" ON public.pe_issue_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pe_auto_fix_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  issue_id uuid REFERENCES public.pe_issue_log(id) ON DELETE SET NULL,
  action text NOT NULL,
  outcome text NOT NULL,         -- success|failure|skipped
  details jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.pe_auto_fix_log TO authenticated;
GRANT ALL ON public.pe_auto_fix_log TO service_role;
ALTER TABLE public.pe_auto_fix_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_autofix" ON public.pe_auto_fix_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pe_manual_approval_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  issue_id uuid REFERENCES public.pe_issue_log(id) ON DELETE SET NULL,
  proposed_action text NOT NULL,
  reason text,
  risk text,
  expected_benefit text,
  payload jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',  -- pending|approved|rejected|executed|failed
  decided_at timestamptz,
  decided_by uuid,
  execution_result jsonb
);
GRANT SELECT ON public.pe_manual_approval_queue TO authenticated;
GRANT ALL ON public.pe_manual_approval_queue TO service_role;
ALTER TABLE public.pe_manual_approval_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_approval" ON public.pe_manual_approval_queue FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update pe_approval" ON public.pe_manual_approval_queue FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pe_daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL DEFAULT (now()::date),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  pdf_path text,
  json_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pe_daily_reports TO authenticated;
GRANT ALL ON public.pe_daily_reports TO service_role;
ALTER TABLE public.pe_daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_daily" ON public.pe_daily_reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Wave 2
CREATE TABLE public.pe_ads_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  ad_account_id text NOT NULL,
  campaign_id text NOT NULL,
  name text,
  status text,
  objective text,
  budget_cents bigint,
  start_time timestamptz,
  end_time timestamptz,
  spend_cents bigint DEFAULT 0,
  impressions bigint DEFAULT 0,
  clicks bigint DEFAULT 0,
  conversions bigint DEFAULT 0,
  roas numeric,
  delivery_status text,
  delivery_blocker text,
  raw jsonb DEFAULT '{}'::jsonb,
  UNIQUE (ad_account_id, campaign_id)
);
GRANT SELECT ON public.pe_ads_campaigns TO authenticated;
GRANT ALL ON public.pe_ads_campaigns TO service_role;
ALTER TABLE public.pe_ads_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_camps" ON public.pe_ads_campaigns FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pe_ads_ad_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  ad_account_id text NOT NULL,
  campaign_id text NOT NULL,
  ad_group_id text NOT NULL,
  name text,
  status text,
  bid_strategy text,
  audience_size bigint,
  budget_cents bigint,
  raw jsonb DEFAULT '{}'::jsonb,
  UNIQUE (ad_account_id, ad_group_id)
);
GRANT SELECT ON public.pe_ads_ad_groups TO authenticated;
GRANT ALL ON public.pe_ads_ad_groups TO service_role;
ALTER TABLE public.pe_ads_ad_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_adgroups" ON public.pe_ads_ad_groups FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pe_ads_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  ad_account_id text NOT NULL,
  ad_group_id text NOT NULL,
  ad_id text NOT NULL,
  pin_id text,
  status text,
  approval_state text,
  raw jsonb DEFAULT '{}'::jsonb,
  UNIQUE (ad_account_id, ad_id)
);
GRANT SELECT ON public.pe_ads_ads TO authenticated;
GRANT ALL ON public.pe_ads_ads TO service_role;
ALTER TABLE public.pe_ads_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_ads" ON public.pe_ads_ads FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pe_ads_delivery_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  ad_account_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  status text,
  blocker text,
  details jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.pe_ads_delivery_diagnostics TO authenticated;
GRANT ALL ON public.pe_ads_delivery_diagnostics TO service_role;
ALTER TABLE public.pe_ads_delivery_diagnostics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_delivery" ON public.pe_ads_delivery_diagnostics FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pe_catalog_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  catalog_id text,
  feed_status text,
  approved_count int DEFAULT 0,
  rejected_count int DEFAULT 0,
  pending_count int DEFAULT 0,
  issues jsonb DEFAULT '{}'::jsonb,
  raw jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.pe_catalog_health TO authenticated;
GRANT ALL ON public.pe_catalog_health TO service_role;
ALTER TABLE public.pe_catalog_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_catalog" ON public.pe_catalog_health FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pe_product_group_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  catalog_id text,
  product_group_id text,
  name text,
  status text,
  raw jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.pe_product_group_health TO authenticated;
GRANT ALL ON public.pe_product_group_health TO service_role;
ALTER TABLE public.pe_product_group_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_pg" ON public.pe_product_group_health FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Wave 3
CREATE TABLE public.pe_tracking_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  tag_present boolean,
  tag_loaded boolean,
  capi_status text,
  last_event_at timestamptz,
  match_quality numeric,
  dedup_rate numeric,
  failed_events_24h int DEFAULT 0,
  consent_gate_ok boolean,
  details jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.pe_tracking_health TO authenticated;
GRANT ALL ON public.pe_tracking_health TO service_role;
ALTER TABLE public.pe_tracking_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_track" ON public.pe_tracking_health FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pe_capi_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_name text NOT NULL,
  event_id text,
  status text,                   -- accepted|deduped|failed
  http_code int,
  payload jsonb,
  response jsonb
);
GRANT SELECT ON public.pe_capi_events TO authenticated;
GRANT ALL ON public.pe_capi_events TO service_role;
ALTER TABLE public.pe_capi_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_capi" ON public.pe_capi_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pe_conversion_funnel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  window_days int NOT NULL DEFAULT 7,
  sessions int DEFAULT 0,
  product_views int DEFAULT 0,
  add_to_carts int DEFAULT 0,
  checkouts int DEFAULT 0,
  purchases int DEFAULT 0,
  revenue_cents bigint DEFAULT 0,
  drop_offs jsonb DEFAULT '{}'::jsonb,
  best_products jsonb DEFAULT '[]'::jsonb,
  worst_products jsonb DEFAULT '[]'::jsonb
);
GRANT SELECT ON public.pe_conversion_funnel TO authenticated;
GRANT ALL ON public.pe_conversion_funnel TO service_role;
ALTER TABLE public.pe_conversion_funnel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_funnel" ON public.pe_conversion_funnel FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Wave 5
CREATE TABLE public.pe_ai_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  optimizer text NOT NULL,
  recommendation text NOT NULL,
  evidence jsonb DEFAULT '{}'::jsonb,
  confidence numeric,
  expected_impact text,
  required_action text,
  safe_to_auto_apply boolean DEFAULT false,
  status text NOT NULL DEFAULT 'open'
);
GRANT SELECT ON public.pe_ai_recommendations TO authenticated;
GRANT ALL ON public.pe_ai_recommendations TO service_role;
ALTER TABLE public.pe_ai_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_reco" ON public.pe_ai_recommendations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.pe_operator_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  trigger text,
  issues_found int DEFAULT 0,
  auto_fixed int DEFAULT 0,
  queued int DEFAULT 0,
  details jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.pe_operator_runs TO authenticated;
GRANT ALL ON public.pe_operator_runs TO service_role;
ALTER TABLE public.pe_operator_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pe_runs" ON public.pe_operator_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

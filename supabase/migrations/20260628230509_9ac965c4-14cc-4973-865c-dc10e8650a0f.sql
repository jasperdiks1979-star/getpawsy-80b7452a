
-- AICOS: AI Company Operating System
CREATE TABLE public.aicos_departments (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  mission text,
  responsibilities jsonb default '[]'::jsonb,
  parent_code text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
GRANT SELECT ON public.aicos_departments TO authenticated;
GRANT ALL ON public.aicos_departments TO service_role;
ALTER TABLE public.aicos_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_aicos_departments" ON public.aicos_departments FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.aicos_employees (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  display_name text not null,
  department_code text not null,
  engine text not null,
  version text default 'v1',
  capabilities jsonb default '[]'::jsonb,
  inputs jsonb default '[]'::jsonb,
  outputs jsonb default '[]'::jsonb,
  dependencies jsonb default '[]'::jsonb,
  health_score numeric default 100,
  avg_latency_ms integer default 0,
  confidence numeric default 0.8,
  status text default 'active',
  last_heartbeat timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
GRANT SELECT ON public.aicos_employees TO authenticated;
GRANT ALL ON public.aicos_employees TO service_role;
ALTER TABLE public.aicos_employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_aicos_employees" ON public.aicos_employees FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.aicos_objectives (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  owner_department text,
  priority numeric default 50,
  status text default 'open',
  expected_value_usd numeric,
  due_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
GRANT SELECT, INSERT, UPDATE ON public.aicos_objectives TO authenticated;
GRANT ALL ON public.aicos_objectives TO service_role;
ALTER TABLE public.aicos_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_aicos_objectives" ON public.aicos_objectives FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.aicos_tasks (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid references public.aicos_objectives(id) on delete set null,
  parent_task_id uuid references public.aicos_tasks(id) on delete set null,
  department_code text,
  assigned_employee text,
  title text not null,
  payload jsonb default '{}'::jsonb,
  status text default 'queued',
  priority_score numeric default 0,
  revenue_impact numeric default 0,
  profit_impact numeric default 0,
  customer_impact numeric default 0,
  strategic_importance numeric default 0,
  risk numeric default 0,
  urgency numeric default 0,
  operational_cost numeric default 0,
  learning_value numeric default 0,
  dependencies jsonb default '[]'::jsonb,
  result jsonb,
  error text,
  correlation_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
CREATE INDEX aicos_tasks_status_priority_idx ON public.aicos_tasks(status, priority_score DESC);
CREATE INDEX aicos_tasks_dept_idx ON public.aicos_tasks(department_code);
GRANT SELECT, INSERT, UPDATE ON public.aicos_tasks TO authenticated;
GRANT ALL ON public.aicos_tasks TO service_role;
ALTER TABLE public.aicos_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_aicos_tasks" ON public.aicos_tasks FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.aicos_messages (
  id uuid primary key default gen_random_uuid(),
  sender text not null,
  receiver text not null,
  context text,
  evidence jsonb default '{}'::jsonb,
  confidence numeric default 0.7,
  priority numeric default 50,
  requested_action text,
  expected_result text,
  deadline timestamptz,
  correlation_id uuid,
  status text default 'sent',
  reply_to uuid,
  created_at timestamptz default now()
);
CREATE INDEX aicos_messages_corr_idx ON public.aicos_messages(correlation_id);
CREATE INDEX aicos_messages_receiver_idx ON public.aicos_messages(receiver, created_at DESC);
GRANT SELECT, INSERT ON public.aicos_messages TO authenticated;
GRANT ALL ON public.aicos_messages TO service_role;
ALTER TABLE public.aicos_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_aicos_messages" ON public.aicos_messages FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.aicos_workflows (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid references public.aicos_objectives(id) on delete cascade,
  name text not null,
  current_stage text default 'observation',
  status text default 'running',
  context jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
GRANT SELECT, INSERT, UPDATE ON public.aicos_workflows TO authenticated;
GRANT ALL ON public.aicos_workflows TO service_role;
ALTER TABLE public.aicos_workflows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_aicos_workflows" ON public.aicos_workflows FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.aicos_workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references public.aicos_workflows(id) on delete cascade,
  stage text not null,
  department_code text,
  status text default 'pending',
  input jsonb,
  output jsonb,
  notes text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);
GRANT SELECT, INSERT, UPDATE ON public.aicos_workflow_steps TO authenticated;
GRANT ALL ON public.aicos_workflow_steps TO service_role;
ALTER TABLE public.aicos_workflow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_aicos_workflow_steps" ON public.aicos_workflow_steps FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.aicos_resources (
  id uuid primary key default gen_random_uuid(),
  resource text unique not null,
  daily_budget numeric default 0,
  used_today numeric default 0,
  hard_cap numeric,
  last_reset_at timestamptz default now(),
  metadata jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);
GRANT SELECT ON public.aicos_resources TO authenticated;
GRANT ALL ON public.aicos_resources TO service_role;
ALTER TABLE public.aicos_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_aicos_resources" ON public.aicos_resources FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.aicos_resource_usage (
  id uuid primary key default gen_random_uuid(),
  resource text not null,
  consumer text not null,
  amount numeric not null,
  task_id uuid,
  created_at timestamptz default now()
);
GRANT SELECT, INSERT ON public.aicos_resource_usage TO authenticated;
GRANT ALL ON public.aicos_resource_usage TO service_role;
ALTER TABLE public.aicos_resource_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_aicos_resource_usage" ON public.aicos_resource_usage FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.aicos_policies (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  weights jsonb default '{}'::jsonb,
  active boolean default false,
  activated_at timestamptz,
  created_at timestamptz default now()
);
GRANT SELECT ON public.aicos_policies TO authenticated;
GRANT ALL ON public.aicos_policies TO service_role;
ALTER TABLE public.aicos_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_aicos_policies" ON public.aicos_policies FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.aicos_memory (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  title text not null,
  body text,
  tags text[] default '{}',
  importance numeric default 50,
  evidence jsonb default '{}'::jsonb,
  search_tsv tsvector,
  created_at timestamptz default now()
);
CREATE INDEX aicos_memory_search_idx ON public.aicos_memory USING gin(search_tsv);
CREATE INDEX aicos_memory_kind_idx ON public.aicos_memory(kind);
GRANT SELECT, INSERT ON public.aicos_memory TO authenticated;
GRANT ALL ON public.aicos_memory TO service_role;
ALTER TABLE public.aicos_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_aicos_memory" ON public.aicos_memory FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.aicos_memory_tsv_update() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv := to_tsvector('simple', coalesce(NEW.title,'')||' '||coalesce(NEW.body,'')||' '||coalesce(array_to_string(NEW.tags,' '),''));
  RETURN NEW;
END;$$;
CREATE TRIGGER aicos_memory_tsv_trg BEFORE INSERT OR UPDATE ON public.aicos_memory
FOR EACH ROW EXECUTE FUNCTION public.aicos_memory_tsv_update();

CREATE TABLE public.aicos_twin_snapshots (
  id uuid primary key default gen_random_uuid(),
  taken_at timestamptz default now(),
  horizon text default 'now',
  metrics jsonb not null default '{}'::jsonb,
  predictions jsonb default '{}'::jsonb,
  notes text
);
GRANT SELECT ON public.aicos_twin_snapshots TO authenticated;
GRANT ALL ON public.aicos_twin_snapshots TO service_role;
ALTER TABLE public.aicos_twin_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_aicos_twin" ON public.aicos_twin_snapshots FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.aicos_health (
  id uuid primary key default gen_random_uuid(),
  taken_at timestamptz default now(),
  business numeric, revenue numeric, customer numeric, creative numeric,
  infrastructure numeric, analytics numeric, knowledge numeric,
  experimentation numeric, governance numeric, executive numeric,
  overall numeric,
  details jsonb default '{}'::jsonb
);
GRANT SELECT ON public.aicos_health TO authenticated;
GRANT ALL ON public.aicos_health TO service_role;
ALTER TABLE public.aicos_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_aicos_health" ON public.aicos_health FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.aicos_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  severity text default 'medium',
  status text default 'open',
  impact_estimate jsonb default '{}'::jsonb,
  departments text[] default '{}',
  owner text,
  action_plan jsonb default '[]'::jsonb,
  resolution text,
  lessons_learned text,
  created_at timestamptz default now(),
  resolved_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.aicos_incidents TO authenticated;
GRANT ALL ON public.aicos_incidents TO service_role;
ALTER TABLE public.aicos_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_aicos_incidents" ON public.aicos_incidents FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.aicos_knowledge_sync (
  id uuid primary key default gen_random_uuid(),
  source_engine text not null,
  target_engine text not null,
  topic text,
  payload jsonb default '{}'::jsonb,
  status text default 'propagated',
  created_at timestamptz default now()
);
GRANT SELECT, INSERT ON public.aicos_knowledge_sync TO authenticated;
GRANT ALL ON public.aicos_knowledge_sync TO service_role;
ALTER TABLE public.aicos_knowledge_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_aicos_knowledge_sync" ON public.aicos_knowledge_sync FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.aicos_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
GRANT SELECT ON public.aicos_settings TO authenticated;
GRANT ALL ON public.aicos_settings TO service_role;
ALTER TABLE public.aicos_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_all_aicos_settings" ON public.aicos_settings FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Seed departments
INSERT INTO public.aicos_departments (code, name, mission) VALUES
('executive','Executive Office','Strategic direction, approvals, accountability'),
('growth','Growth','Acquisition, retention, expansion'),
('revenue','Revenue','Maximize profitable revenue'),
('marketing','Marketing','Demand generation and brand'),
('pinterest','Pinterest','Pinterest acquisition channel'),
('creative','Creative','Creative production and evolution'),
('analytics','Analytics','Funnel truth and data quality'),
('business_intelligence','Business Intelligence','Business facts and KPIs'),
('customer_intelligence','Customer Intelligence','Customer psychology and segmentation'),
('commerce','Commerce','Checkout, payments, conversion'),
('pricing','Pricing','Pricing strategy and elasticity'),
('inventory','Inventory','Stock, suppliers, fulfillment'),
('operations','Operations','Day-to-day platform operations'),
('infrastructure','Infrastructure','Edge functions, DB, integrations'),
('governance','Governance','Audit, compliance, safety'),
('knowledge','Knowledge','Knowledge graph and memory'),
('experimentation','Experimentation','Hypothesis testing and learning'),
('strategy','Strategy','Long-range planning')
ON CONFLICT (code) DO NOTHING;

-- Seed AI employees mapping engines -> departments
INSERT INTO public.aicos_employees (code, display_name, department_code, engine) VALUES
('gbd','Business DNA','business_intelligence','gbd-api'),
('gcp','Customer Psychology DNA','customer_intelligence','gcp-api'),
('gpi','Pinterest Intelligence DNA','pinterest','gpi-api'),
('gcd','Creative DNA','creative','gcd-api'),
('gad','Analytics DNA','analytics','gad-api'),
('gpd','Product Intelligence DNA','business_intelligence','gpd-api'),
('gmd','Market Intelligence DNA','business_intelligence','gmd-api'),
('gkg','Knowledge Graph & Reasoning','knowledge','gkg-api'),
('ede','Executive Decision Engine','executive','ede-api'),
('aee','Autonomous Experimentation','experimentation','aee-api'),
('roe','Revenue Optimization','revenue','roe-api'),
('spe','Strategic Planning','strategy','spe-api'),
('aos','AOS Orchestrator','infrastructure','aos-orchestrator'),
('agal','Governance & Audit','governance','agal-auditor'),
('mil','Meta Intelligence','executive','mil-meta-intelligence')
ON CONFLICT (code) DO NOTHING;

-- Seed default execution policies
INSERT INTO public.aicos_policies (code, name, description, weights, active, activated_at) VALUES
('profit_first','Profit First','Maximize profitable revenue','{"profit":1.0,"revenue":0.6,"learning":0.3,"risk":-0.4}',true, now()),
('revenue_first','Revenue First','Maximize top-line revenue','{"revenue":1.0,"profit":0.4,"learning":0.2}',false,null),
('learning_first','Learning First','Maximize experimentation value','{"learning":1.0,"risk":-0.2}',false,null),
('growth_first','Growth First','Aggressive acquisition','{"revenue":0.7,"customer":0.7,"learning":0.4}',false,null),
('brand_first','Brand First','Protect brand quality','{"customer":0.8,"risk":-0.6}',false,null),
('safety_first','Safety First','Risk minimization','{"risk":-1.0,"profit":0.5}',false,null),
('energy_saving','Energy Saving','Reduce compute spend','{"operational_cost":-1.0}',false,null),
('low_credit','Low Credit Mode','Conserve AI credits','{"operational_cost":-1.0,"learning":-0.3}',false,null),
('holiday_mode','Holiday Mode','Holiday peak posture','{"revenue":1.0,"customer":0.6}',false,null),
('emergency_mode','Emergency Mode','Incident response','{"risk":-1.0,"urgency":1.0}',false,null),
('maintenance_mode','Maintenance Mode','Pause non-critical work','{"operational_cost":-1.0,"risk":-0.6}',false,null)
ON CONFLICT (code) DO NOTHING;

-- Seed default resource budgets
INSERT INTO public.aicos_resources (resource, daily_budget) VALUES
('llm_credits',100000),('image_credits',2000),('video_credits',200),
('pinterest_api',10000),('tiktok_api',5000),('ga4_api',50000),
('supabase_calls',1000000),('workers',1000),('cron_runs',2000),
('edge_function_calls',500000),('cpu_seconds',86400),('memory_mb_hours',100000),('storage_gb',100)
ON CONFLICT (resource) DO NOTHING;

INSERT INTO public.aicos_settings (key, value) VALUES
('version','{"name":"AICOS","version":"1.0.0"}'),
('priority_weights','{"revenue":1.0,"profit":1.2,"customer":0.6,"strategic":0.7,"risk":-0.5,"urgency":0.4,"operational_cost":-0.3,"learning":0.3}')
ON CONFLICT (key) DO NOTHING;

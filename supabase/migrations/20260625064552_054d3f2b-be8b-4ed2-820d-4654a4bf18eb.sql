
-- ============ Creative Optimization Engine V1 ============

-- Helper for updated_at
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 1. creative_generation_runs (created first so FK works)
CREATE TABLE IF NOT EXISTS public.creative_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'no_ai',           -- no_ai | ai_static | ai_video | planner
  trigger text NOT NULL DEFAULT 'manual',       -- manual | cron | api
  dry_run boolean NOT NULL DEFAULT true,
  requested int NOT NULL DEFAULT 0,
  generated int NOT NULL DEFAULT 0,
  skipped int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  blocked_duplicates int NOT NULL DEFAULT 0,
  est_credits numeric NOT NULL DEFAULT 0,
  actual_credits numeric NOT NULL DEFAULT 0,
  est_usd numeric NOT NULL DEFAULT 0,
  actual_usd numeric NOT NULL DEFAULT 0,
  budget_cap_usd numeric NOT NULL DEFAULT 15,
  status text NOT NULL DEFAULT 'pending',       -- pending | running | done | failed | aborted_budget
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_generation_runs TO authenticated;
GRANT ALL ON public.creative_generation_runs TO service_role;
ALTER TABLE public.creative_generation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage runs" ON public.creative_generation_runs FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_cgr_updated BEFORE UPDATE ON public.creative_generation_runs FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2. creative_assets
CREATE TABLE IF NOT EXISTS public.creative_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.creative_generation_runs(id) ON DELETE SET NULL,
  product_id uuid,
  source_media_id uuid,
  product_title text,
  category_slug text,
  board_candidate text,
  creative_type text NOT NULL,  -- pinterest_static | pinterest_video | idea_pin | ad_static | ad_video | pdp_hero | collection_banner | og_image
  hook text,
  headline text,
  subheadline text,
  cta text,
  overlay_text text,
  image_url text,
  video_url text,
  pdp_url text,
  utm_url text,
  generation_model text,
  ai_cost_credits numeric DEFAULT 0,
  ai_cost_usd numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',  -- draft | approved | rejected | queued | published | failed
  rejection_reason text,
  quality_score int DEFAULT 0,
  uniqueness_score int DEFAULT 0,
  diversity_score int DEFAULT 0,
  compliance_score int DEFAULT 0,
  priority_score int DEFAULT 0,
  hook_hash text,
  media_hash text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_at timestamptz,
  approved_by uuid,
  routed_to text,                       -- pinterest_queue | pdp_candidate | collection_candidate | og_candidate
  routed_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_creative_assets_dedupe
  ON public.creative_assets (product_id, creative_type, hook_hash)
  WHERE hook_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ca_status ON public.creative_assets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ca_product ON public.creative_assets(product_id);
CREATE INDEX IF NOT EXISTS idx_ca_run ON public.creative_assets(run_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_assets TO authenticated;
GRANT ALL ON public.creative_assets TO service_role;
ALTER TABLE public.creative_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage assets" ON public.creative_assets FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_ca_updated BEFORE UPDATE ON public.creative_assets FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. creative_variants
CREATE TABLE IF NOT EXISTS public.creative_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES public.creative_assets(id) ON DELETE CASCADE,
  variant_kind text NOT NULL,            -- copy | layout | image | video
  hook text, headline text, cta text,
  image_url text, video_url text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_variants TO authenticated;
GRANT ALL ON public.creative_variants TO service_role;
ALTER TABLE public.creative_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage variants" ON public.creative_variants FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4. creative_performance_snapshots
CREATE TABLE IF NOT EXISTS public.creative_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_asset_id uuid REFERENCES public.creative_assets(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  impressions int DEFAULT 0,
  saves int DEFAULT 0,
  clicks int DEFAULT 0,
  outbound_clicks int DEFAULT 0,
  ctr numeric DEFAULT 0,
  add_to_cart int DEFAULT 0,
  checkout int DEFAULT 0,
  purchase int DEFAULT 0,
  spend_usd numeric DEFAULT 0,
  verdict text,                          -- winner | loser | neutral | fatigue
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(creative_asset_id, snapshot_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_performance_snapshots TO authenticated;
GRANT ALL ON public.creative_performance_snapshots TO service_role;
ALTER TABLE public.creative_performance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage snapshots" ON public.creative_performance_snapshots FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 5. creative_rotation_rules (seeded singleton with defaults)
CREATE TABLE IF NOT EXISTS public.creative_rotation_rules (
  id int PRIMARY KEY DEFAULT 1,
  max_per_board_30d int NOT NULL DEFAULT 30,
  max_per_category_30d int NOT NULL DEFAULT 50,
  max_per_product_30d int NOT NULL DEFAULT 6,
  max_hook_repeat_30d int NOT NULL DEFAULT 3,
  max_per_product_per_day int NOT NULL DEFAULT 4,
  max_videos_per_product_per_week int NOT NULL DEFAULT 2,
  banned_phrases jsonb NOT NULL DEFAULT '["stop scooping","vet-approved","eco-friendly","never clean litter again"]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.creative_rotation_rules TO authenticated;
GRANT ALL ON public.creative_rotation_rules TO service_role;
ALTER TABLE public.creative_rotation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage rotation" ON public.creative_rotation_rules FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.creative_rotation_rules (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 6. creative_fatigue_flags
CREATE TABLE IF NOT EXISTS public.creative_fatigue_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,                   -- hook | visual | product | category | board
  scope_key text NOT NULL,
  reason text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  detected_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_cff_active ON public.creative_fatigue_flags(scope, active) WHERE active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_fatigue_flags TO authenticated;
GRANT ALL ON public.creative_fatigue_flags TO service_role;
ALTER TABLE public.creative_fatigue_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage fatigue" ON public.creative_fatigue_flags FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 7. creative_test_queue
CREATE TABLE IF NOT EXISTS public.creative_test_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_a uuid REFERENCES public.creative_assets(id) ON DELETE CASCADE,
  asset_b uuid REFERENCES public.creative_assets(id) ON DELETE CASCADE,
  hypothesis text,
  status text NOT NULL DEFAULT 'pending',
  winner uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_test_queue TO authenticated;
GRANT ALL ON public.creative_test_queue TO service_role;
ALTER TABLE public.creative_test_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage tests" ON public.creative_test_queue FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 8. creative_prompts (seeded)
CREATE TABLE IF NOT EXISTS public.creative_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_key text UNIQUE NOT NULL,
  display_name text NOT NULL,
  category text NOT NULL,                -- pinterest | ad | onsite | rewrite
  system_prompt text NOT NULL,
  user_template text NOT NULL,
  guardrails jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_prompts TO authenticated;
GRANT ALL ON public.creative_prompts TO service_role;
ALTER TABLE public.creative_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage prompts" ON public.creative_prompts FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_cp_updated BEFORE UPDATE ON public.creative_prompts FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.creative_prompts (prompt_key, display_name, category, system_prompt, user_template, guardrails) VALUES
('pinterest_product','Pinterest product pin','pinterest','You write Pinterest pins for GetPawsy, a premium US pet brand. Tone: warm, confident, human, never salesy. Premium pet-home aesthetic.','Product: {{title}}. Category: {{category}}. Benefit angle: {{angle}}. Return JSON {hook, headline, subheadline, cta, overlay}.','{"max_words_overlay":5,"banned":["stop scooping","vet-approved"]}'),
('pinterest_educational','Pinterest educational pin','pinterest','You teach US pet parents one small useful tip linked to a real GetPawsy product.','Topic: {{topic}}. Product: {{title}}. Return JSON {hook, headline, subheadline, cta, overlay}.','{}'),
('pinterest_comparison','Pinterest comparison pin','pinterest','Honest before/after style comparison. No fake claims.','Product: {{title}}. Compare: {{comparison}}. Return JSON.','{}'),
('pinterest_problem_solution','Pinterest problem/solution pin','pinterest','Relatable pain → calm solution. No clickbait.','Pain: {{pain}}. Solution product: {{title}}. Return JSON.','{}'),
('pinterest_seasonal','Pinterest seasonal pin','pinterest','Tie product to US season/holiday naturally.','Season: {{season}}. Product: {{title}}. Return JSON.','{}'),
('pinterest_ad','Pinterest ad variant','ad','Higher-intent ad copy for Pinterest Ads. Outcome-driven CTA.','Product: {{title}}. Offer: {{offer}}. Return JSON.','{}'),
('pdp_hero','PDP hero concept','onsite','Concept brief for a PDP hero shot.','Product: {{title}}. Return JSON {concept, prompt, overlay}.','{}'),
('collection_banner','Collection banner concept','onsite','Concept brief for a collection banner.','Collection: {{category}}. Return JSON {concept, prompt, headline}.','{}'),
('video_storyboard','Video storyboard','onsite','6-beat storyboard for a 15s product video.','Product: {{title}}. Return JSON {beats:[{t,visual,vo}]}.','{}'),
('hook_rewrite','Hook/headline rewrite','rewrite','Rewrite a tired hook into 3 fresh options that obey GetPawsy tone.','Original: {{hook}}. Return JSON {options:[..]}.','{}'),
('failed_replacement','Failed creative replacement','rewrite','Given a rejected creative + reason, propose a compliant replacement.','Original: {{json}}. Reason: {{reason}}. Return JSON.','{}')
ON CONFLICT (prompt_key) DO NOTHING;

-- 9. creative_budget_guardrails (singleton)
CREATE TABLE IF NOT EXISTS public.creative_budget_guardrails (
  id int PRIMARY KEY DEFAULT 1,
  max_per_run int NOT NULL DEFAULT 20,
  max_usd_per_run numeric NOT NULL DEFAULT 15,
  per_product_per_day int NOT NULL DEFAULT 4,
  videos_per_product_per_week int NOT NULL DEFAULT 2,
  dry_run_default boolean NOT NULL DEFAULT true,
  auto_generate_enabled boolean NOT NULL DEFAULT false,
  hard_pause boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.creative_budget_guardrails TO authenticated;
GRANT ALL ON public.creative_budget_guardrails TO service_role;
ALTER TABLE public.creative_budget_guardrails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage budget" ON public.creative_budget_guardrails FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.creative_budget_guardrails (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 10. approval queue view
CREATE OR REPLACE VIEW public.creative_approval_queue AS
SELECT id, product_id, product_title, category_slug, creative_type, hook, headline, cta, image_url, pdp_url, priority_score, created_at
FROM public.creative_assets
WHERE status = 'draft'
ORDER BY priority_score DESC, created_at DESC;
GRANT SELECT ON public.creative_approval_queue TO authenticated;
GRANT ALL ON public.creative_approval_queue TO service_role;

-- app_config flag
INSERT INTO public.app_config (key, value) VALUES ('creative_auto_generate_enabled','false')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pinterest_visual_identity_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
GRANT SELECT ON public.pinterest_visual_identity_settings TO authenticated;
GRANT ALL ON public.pinterest_visual_identity_settings TO service_role;
ALTER TABLE public.pinterest_visual_identity_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read vpi settings" ON public.pinterest_visual_identity_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.pinterest_visual_identity_settings(key,value) VALUES ('enabled','true'::jsonb),('min_identity_score','98'::jsonb),('block_publish','true'::jsonb),('cache_ttl_hours','72'::jsonb) ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.pinterest_visual_identity_runs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ, mode TEXT NOT NULL DEFAULT 'full', scope TEXT NOT NULL DEFAULT 'all', pins_total INT NOT NULL DEFAULT 0, pins_scored INT NOT NULL DEFAULT 0, pins_pass INT NOT NULL DEFAULT 0, pins_fail INT NOT NULL DEFAULT 0, pins_repaired INT NOT NULL DEFAULT 0, pins_replace_required INT NOT NULL DEFAULT 0, ai_calls INT NOT NULL DEFAULT 0, ai_lane TEXT NOT NULL DEFAULT 'unknown', notes TEXT, summary JSONB NOT NULL DEFAULT '{}'::jsonb);
GRANT SELECT ON public.pinterest_visual_identity_runs TO authenticated;
GRANT ALL ON public.pinterest_visual_identity_runs TO service_role;
ALTER TABLE public.pinterest_visual_identity_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read vpi runs" ON public.pinterest_visual_identity_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.pinterest_visual_identity_audits (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), run_id UUID REFERENCES public.pinterest_visual_identity_runs(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), source TEXT NOT NULL, product_id UUID NOT NULL, product_slug TEXT NOT NULL, pin_queue_id UUID, pinterest_pin_id TEXT, pin_image_url TEXT NOT NULL, destination_link TEXT, identity_score INT NOT NULL DEFAULT 0, same_product BOOLEAN NOT NULL DEFAULT FALSE, passed BOOLEAN NOT NULL DEFAULT FALSE, wrong_product_kind TEXT NOT NULL DEFAULT 'none', recommended_action TEXT NOT NULL DEFAULT 'manual_review', best_reference_image TEXT, axes JSONB NOT NULL DEFAULT '{}'::jsonb, differences JSONB NOT NULL DEFAULT '[]'::jsonb, raw JSONB, vision_model TEXT, latency_ms INT, repair_status TEXT NOT NULL DEFAULT 'pending', repair_notes TEXT);
CREATE INDEX IF NOT EXISTS idx_vpi_audits_product ON public.pinterest_visual_identity_audits(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vpi_audits_pin_image ON public.pinterest_visual_identity_audits(product_id, pin_image_url, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vpi_audits_passed ON public.pinterest_visual_identity_audits(passed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vpi_audits_run ON public.pinterest_visual_identity_audits(run_id);
GRANT SELECT ON public.pinterest_visual_identity_audits TO authenticated;
GRANT ALL ON public.pinterest_visual_identity_audits TO service_role;
ALTER TABLE public.pinterest_visual_identity_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read vpi audits" ON public.pinterest_visual_identity_audits FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 1. Template bank
CREATE TABLE IF NOT EXISTS public.pinterest_v2_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key text NOT NULL,
  template_type text NOT NULL CHECK (template_type IN ('headline','cta','description','hook')),
  emotional_angle text NOT NULL,
  text text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'ai_seed',
  usage_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_v2_templates_lookup ON public.pinterest_v2_templates (category_key, template_type, emotional_angle) WHERE is_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_v2_templates_text ON public.pinterest_v2_templates (category_key, template_type, lower(text));

GRANT SELECT ON public.pinterest_v2_templates TO authenticated;
GRANT ALL ON public.pinterest_v2_templates TO service_role;
ALTER TABLE public.pinterest_v2_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read v2 templates" ON public.pinterest_v2_templates
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_touch_v2_templates BEFORE UPDATE ON public.pinterest_v2_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Engine runs log
CREATE TABLE IF NOT EXISTS public.pinterest_v2_engine_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  jobs_processed integer NOT NULL DEFAULT 0,
  pins_published integer NOT NULL DEFAULT 0,
  pins_verified integer NOT NULL DEFAULT 0,
  pins_archived integer NOT NULL DEFAULT 0,
  templates_seeded integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pinterest_v2_engine_runs TO authenticated;
GRANT ALL ON public.pinterest_v2_engine_runs TO service_role;
ALTER TABLE public.pinterest_v2_engine_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read v2 runs" ON public.pinterest_v2_engine_runs
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. Auto-publish tracking columns on existing replacement jobs
ALTER TABLE public.pinterest_overlay_replacement_jobs
  ADD COLUMN IF NOT EXISTS auto_publish boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_queue_id uuid,
  ADD COLUMN IF NOT EXISTS published_pin_id text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_eligible_at timestamptz,
  ADD COLUMN IF NOT EXISTS emotional_angle text,
  ADD COLUMN IF NOT EXISTS headline_used text,
  ADD COLUMN IF NOT EXISTS cta_used text;

CREATE INDEX IF NOT EXISTS ix_overlay_repl_archive_ready
  ON public.pinterest_overlay_replacement_jobs (archive_eligible_at)
  WHERE archive_eligible_at IS NOT NULL AND archived_at IS NULL;

-- 4. Diversity guard view: live usage of each text across posted pins (last 90d)
CREATE OR REPLACE VIEW public.pinterest_v2_live_usage AS
SELECT 'headline'::text AS kind, lower(pin_title) AS key, count(*)::int AS live_count
FROM public.pinterest_pin_queue
WHERE status = 'posted' AND posted_at > now() - interval '90 days'
GROUP BY lower(pin_title)
UNION ALL
SELECT 'overlay'::text, lower(overlay_text), count(*)::int
FROM public.pinterest_pin_queue
WHERE status = 'posted' AND posted_at > now() - interval '90 days' AND overlay_text IS NOT NULL
GROUP BY lower(overlay_text);

GRANT SELECT ON public.pinterest_v2_live_usage TO authenticated;
GRANT SELECT ON public.pinterest_v2_live_usage TO service_role;


-- 1. DNA fingerprints (365d duplicate guard)
CREATE TABLE IF NOT EXISTS public.pcie2_dna_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  prompt_hash text NOT NULL,
  headline_hash text,
  image_phash text,
  dna_vector jsonb NOT NULL DEFAULT '{}'::jsonb,
  camera text, angle text, lighting text, palette text,
  environment text, room text, breed text,
  emotion text, cta text, composition text,
  concept text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pcie2_dna_prompt_idx ON public.pcie2_dna_fingerprints(prompt_hash);
CREATE INDEX IF NOT EXISTS pcie2_dna_headline_idx ON public.pcie2_dna_fingerprints(headline_hash);
CREATE INDEX IF NOT EXISTS pcie2_dna_product_idx ON public.pcie2_dna_fingerprints(product_id, created_at DESC);
GRANT SELECT ON public.pcie2_dna_fingerprints TO authenticated;
GRANT ALL ON public.pcie2_dna_fingerprints TO service_role;
ALTER TABLE public.pcie2_dna_fingerprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read pcie2_dna_fingerprints" ON public.pcie2_dna_fingerprints
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. Zero-waste evidence log
CREATE TABLE IF NOT EXISTS public.pcie2_zero_waste_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase text NOT NULL,            -- pre_gen | dna_guard | prompt_cert | budget_stop | post_qa | publish
  outcome text NOT NULL,          -- allow | block | shadow_block
  product_id uuid,
  job_id uuid,
  score numeric,
  threshold numeric,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  credits_saved numeric NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pcie2_zw_phase_idx ON public.pcie2_zero_waste_events(phase, created_at DESC);
CREATE INDEX IF NOT EXISTS pcie2_zw_outcome_idx ON public.pcie2_zero_waste_events(outcome, created_at DESC);
GRANT SELECT ON public.pcie2_zero_waste_events TO authenticated;
GRANT ALL ON public.pcie2_zero_waste_events TO service_role;
ALTER TABLE public.pcie2_zero_waste_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read pcie2_zero_waste_events" ON public.pcie2_zero_waste_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. Extend pinterest_credit_state with V2 telemetry
ALTER TABLE public.pinterest_credit_state
  ADD COLUMN IF NOT EXISTS rolling_reject_rate_100 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS projected_waste_pct numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_cap_hard integer DEFAULT 40,
  ADD COLUMN IF NOT EXISTS weekly_cap_hard integer DEFAULT 200,
  ADD COLUMN IF NOT EXISTS zero_waste_v2_shadow boolean DEFAULT true;

-- 4. Feature flags (frozen_rules)
INSERT INTO public.pcie2_frozen_rules (rule_key, reason)
VALUES ('zero_waste_v2_enabled', 'Zero-Waste Pinterest AI Engine V2 master switch')
ON CONFLICT DO NOTHING;
INSERT INTO public.pcie2_frozen_rules (rule_key, reason)
VALUES ('zero_waste_v2_shadow', 'Shadow-mode gates log but do not block (first hour)')
ON CONFLICT DO NOTHING;

-- 5. Success probability function
CREATE OR REPLACE FUNCTION public.pinterest_success_probability(_product_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s numeric := 0;
  p RECORD;
  img_ok boolean := false;
  cooldown_days integer;
  last_pin_at timestamptz;
BEGIN
  SELECT id, name, slug, us_stock, price, cost_price, images, category, meta_description, seo_title
    INTO p FROM public.products WHERE id = _product_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Base: PDP completeness (30 pts)
  IF p.name IS NOT NULL AND length(p.name) >= 10 THEN s := s + 6; END IF;
  IF p.seo_title IS NOT NULL AND length(p.seo_title) >= 20 THEN s := s + 6; END IF;
  IF p.meta_description IS NOT NULL AND length(p.meta_description) >= 60 THEN s := s + 6; END IF;
  IF p.slug IS NOT NULL AND length(p.slug) >= 5 THEN s := s + 6; END IF;
  IF p.category IS NOT NULL THEN s := s + 6; END IF;

  -- Images (15 pts)
  IF p.images IS NOT NULL AND jsonb_array_length(COALESCE(p.images,'[]'::jsonb)) >= 1 THEN
    img_ok := true; s := s + 15;
  END IF;

  -- US stock (20 pts) — HARD requirement
  IF COALESCE(p.us_stock,0) >= 5 THEN s := s + 20;
  ELSIF COALESCE(p.us_stock,0) >= 1 THEN s := s + 10;
  ELSE s := s - 30;   -- effectively kills OOS
  END IF;

  -- Margin (15 pts)
  IF p.price IS NOT NULL AND p.cost_price IS NOT NULL AND p.price > 0 THEN
    IF (p.price - p.cost_price) / p.price >= 0.45 THEN s := s + 15;
    ELSIF (p.price - p.cost_price) / p.price >= 0.30 THEN s := s + 10;
    ELSIF (p.price - p.cost_price) / p.price >= 0.15 THEN s := s + 4;
    END IF;
  END IF;

  -- Price sanity (5 pts)
  IF p.price BETWEEN 9 AND 500 THEN s := s + 5; END IF;

  -- Cooldown: recent pin publishing suppresses reuse (15 pts)
  SELECT MAX(created_at) INTO last_pin_at
    FROM public.pcie2_publish_queue
    WHERE product_id = _product_id AND status = 'published';
  IF last_pin_at IS NULL THEN
    s := s + 15;  -- fresh product
  ELSE
    cooldown_days := EXTRACT(EPOCH FROM now() - last_pin_at) / 86400;
    IF cooldown_days >= 30 THEN s := s + 15;
    ELSIF cooldown_days >= 14 THEN s := s + 10;
    ELSIF cooldown_days >= 7  THEN s := s + 4;
    ELSE s := s - 10;
    END IF;
  END IF;

  RETURN GREATEST(0, LEAST(100, s));
END;
$$;

REVOKE ALL ON FUNCTION public.pinterest_success_probability(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pinterest_success_probability(uuid) TO authenticated, service_role;

-- 6. Combined generation gate (Phase 1 + Phase 4)
CREATE OR REPLACE FUNCTION public.pcie2_should_generate(_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  score numeric;
  cs RECORD;
  reasons jsonb := '[]'::jsonb;
  images_today integer;
  rejects_today integer;
  reject_rate numeric := 0;
  enabled boolean := true;
  shadow boolean := true;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.pcie2_frozen_rules
                WHERE rule_key='zero_waste_v2_enabled'
                  AND (frozen_until IS NULL OR frozen_until > now())) INTO enabled;
  SELECT EXISTS(SELECT 1 FROM public.pcie2_frozen_rules
                WHERE rule_key='zero_waste_v2_shadow'
                  AND (frozen_until IS NULL OR frozen_until > now())) INTO shadow;

  score := public.pinterest_success_probability(_product_id);
  SELECT * INTO cs FROM public.pinterest_credit_state WHERE id = 1;

  IF cs.paused OR cs.state = 'red' OR cs.image_generation_killed OR cs.manual_pause THEN
    reasons := reasons || jsonb_build_object('code','gateway_or_pause','detail',cs.state);
  END IF;
  IF COALESCE(cs.credits_remaining, 999) < COALESCE(cs.min_balance_credits, 5) THEN
    reasons := reasons || jsonb_build_object('code','buffer_below_min','remaining',cs.credits_remaining);
  END IF;

  SELECT COUNT(*) INTO rejects_today FROM public.pcie2_publish_queue
    WHERE created_at > now() - interval '24 hours' AND status = 'rejected';
  SELECT COUNT(*) INTO images_today FROM public.pcie2_creatives
    WHERE created_at > now() - interval '24 hours';

  IF images_today > 0 THEN
    reject_rate := rejects_today::numeric / GREATEST(images_today, 1);
  END IF;
  IF reject_rate > 0.15 AND images_today > 20 THEN
    reasons := reasons || jsonb_build_object('code','rolling_reject_gt_15','rate',reject_rate);
  END IF;

  IF images_today >= COALESCE(cs.daily_cap_hard, 40) THEN
    reasons := reasons || jsonb_build_object('code','daily_cap_hit','images',images_today);
  END IF;

  IF score < 95 THEN
    reasons := reasons || jsonb_build_object('code','pre_gen_below_95','score',score);
  END IF;

  RETURN jsonb_build_object(
    'allow', (jsonb_array_length(reasons) = 0) OR (enabled AND shadow),
    'hard_allow', jsonb_array_length(reasons) = 0,
    'enabled', enabled,
    'shadow', shadow,
    'score', score,
    'reject_rate_today', reject_rate,
    'images_today', images_today,
    'rejects_today', rejects_today,
    'reasons', reasons
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pcie2_should_generate(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.pcie2_should_generate(uuid) TO authenticated, service_role;

-- 7. Mission Control view
CREATE OR REPLACE VIEW public.v_zero_waste_dashboard
WITH (security_invoker = true) AS
WITH q AS (
  SELECT
    COUNT(*) FILTER (WHERE status='published' AND created_at > now() - interval '24 hours') AS pins_today,
    COUNT(*) FILTER (WHERE status='rejected'  AND created_at > now() - interval '24 hours') AS rejects_today,
    COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') AS total_today,
    COUNT(*) FILTER (WHERE status='published' AND created_at > now() - interval '7 days') AS pins_7d,
    COUNT(*) FILTER (WHERE status='rejected'  AND created_at > now() - interval '7 days') AS rejects_7d,
    COUNT(*) FILTER (WHERE created_at > now() - interval '7 days') AS total_7d
  FROM public.pcie2_publish_queue
),
c AS (
  SELECT COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours') AS images_today
  FROM public.pcie2_creatives
),
zw AS (
  SELECT
    COUNT(*) FILTER (WHERE phase='pre_gen'      AND outcome IN ('block','shadow_block')) AS pre_gen_blocks,
    COUNT(*) FILTER (WHERE phase='dna_guard'    AND outcome IN ('block','shadow_block')) AS dna_blocks,
    COUNT(*) FILTER (WHERE phase='prompt_cert'  AND outcome IN ('block','shadow_block')) AS prompt_blocks,
    COUNT(*) FILTER (WHERE phase='budget_stop'  AND outcome IN ('block','shadow_block')) AS budget_blocks,
    COALESCE(SUM(credits_saved),0) AS credits_saved
  FROM public.pcie2_zero_waste_events
  WHERE created_at > now() - interval '7 days'
),
cs AS (
  SELECT state, paused, credits_remaining, daily_cap_hard, rolling_reject_rate_100,
         projected_waste_pct, zero_waste_v2_shadow
  FROM public.pinterest_credit_state WHERE id=1
)
SELECT
  q.pins_today, q.rejects_today, q.total_today,
  q.pins_7d, q.rejects_7d, q.total_7d,
  CASE WHEN q.total_7d>0 THEN ROUND(100.0*q.rejects_7d/q.total_7d,1) ELSE 0 END AS reject_pct_7d,
  CASE WHEN q.total_today>0 THEN ROUND(100.0*q.rejects_today/q.total_today,1) ELSE 0 END AS reject_pct_today,
  c.images_today,
  CASE WHEN q.pins_7d>0 THEN ROUND(c.images_today::numeric/GREATEST(q.pins_7d,1),2) ELSE NULL END AS credits_per_pin_estimate,
  zw.pre_gen_blocks, zw.dna_blocks, zw.prompt_blocks, zw.budget_blocks, zw.credits_saved,
  cs.state AS gateway_state, cs.paused, cs.credits_remaining, cs.daily_cap_hard,
  cs.rolling_reject_rate_100, cs.projected_waste_pct, cs.zero_waste_v2_shadow
FROM q, c, zw, cs;

GRANT SELECT ON public.v_zero_waste_dashboard TO authenticated;

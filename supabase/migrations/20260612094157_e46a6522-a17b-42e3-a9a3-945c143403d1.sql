
-- 1. Variety pools (headline/overlay/cta/description × category)
CREATE TABLE IF NOT EXISTS public.pinterest_variety_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('headline','overlay','cta','description')),
  text text NOT NULL,
  text_norm text GENERATED ALWAYS AS (lower(btrim(text))) STORED,
  score numeric NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  banned boolean NOT NULL DEFAULT false,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, kind, text_norm)
);
CREATE INDEX IF NOT EXISTS idx_variety_pools_cat_kind ON public.pinterest_variety_pools(category, kind) WHERE banned = false;
CREATE INDEX IF NOT EXISTS idx_variety_pools_banned ON public.pinterest_variety_pools(banned);

GRANT SELECT ON public.pinterest_variety_pools TO authenticated;
GRANT ALL ON public.pinterest_variety_pools TO service_role;
ALTER TABLE public.pinterest_variety_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read variety pools" ON public.pinterest_variety_pools
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service role manage variety pools" ON public.pinterest_variety_pools
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Governor rules (single-row config)
CREATE TABLE IF NOT EXISTS public.pinterest_governor_rules (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  max_active_per_slug integer NOT NULL DEFAULT 8,
  max_per_board_per_slug integer NOT NULL DEFAULT 2,
  copy_repeat_lookback integer NOT NULL DEFAULT 90,
  board_diversity_target numeric NOT NULL DEFAULT 0.25,
  top3_board_share_cap numeric NOT NULL DEFAULT 0.60,
  banned_phrases jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.pinterest_governor_rules (id, banned_phrases)
VALUES (1, '["Stop Scooping So Much","Stop Buying Cheap Cat Trees","Why Cat Owners Are Switching","Cats Are Obsessed With This"]'::jsonb)
ON CONFLICT (id) DO UPDATE SET banned_phrases = EXCLUDED.banned_phrases, updated_at = now();

GRANT SELECT ON public.pinterest_governor_rules TO authenticated;
GRANT ALL ON public.pinterest_governor_rules TO service_role;
ALTER TABLE public.pinterest_governor_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read governor rules" ON public.pinterest_governor_rules
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service role manage governor rules" ON public.pinterest_governor_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Governor check function
CREATE OR REPLACE FUNCTION public.governor_check_pin(
  p_slug text,
  p_board_id text,
  p_headline text,
  p_overlay text,
  p_cta text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules public.pinterest_governor_rules%ROWTYPE;
  v_violations jsonb := '[]'::jsonb;
  v_slug_count integer;
  v_board_slug_count integer;
  v_recent_h integer;
  v_recent_o integer;
  v_recent_c integer;
  v_phrase text;
BEGIN
  SELECT * INTO v_rules FROM public.pinterest_governor_rules WHERE id = 1;
  IF NOT FOUND OR v_rules.enabled = false THEN
    RETURN jsonb_build_object('allowed', true, 'violations', '[]'::jsonb, 'enabled', false);
  END IF;

  -- per-slug active cap
  SELECT count(*) INTO v_slug_count
  FROM public.pinterest_pin_queue
  WHERE product_slug = p_slug
    AND status IN ('published','queued','approved','scheduled');
  IF v_slug_count >= v_rules.max_active_per_slug THEN
    v_violations := v_violations || jsonb_build_object('rule','max_active_per_slug','value',v_slug_count,'limit',v_rules.max_active_per_slug);
  END IF;

  -- per-board per-slug
  IF p_board_id IS NOT NULL THEN
    SELECT count(*) INTO v_board_slug_count
    FROM public.pinterest_pin_queue
    WHERE product_slug = p_slug AND board_id = p_board_id
      AND status IN ('published','queued','approved','scheduled');
    IF v_board_slug_count >= v_rules.max_per_board_per_slug THEN
      v_violations := v_violations || jsonb_build_object('rule','max_per_board_per_slug','value',v_board_slug_count,'limit',v_rules.max_per_board_per_slug);
    END IF;
  END IF;

  -- copy repeat in last N published pins
  IF p_headline IS NOT NULL AND length(btrim(p_headline)) > 0 THEN
    SELECT count(*) INTO v_recent_h FROM (
      SELECT pin_title FROM public.pinterest_pin_queue
      WHERE status = 'published'
      ORDER BY posted_at DESC NULLS LAST
      LIMIT v_rules.copy_repeat_lookback
    ) t WHERE lower(btrim(t.pin_title)) = lower(btrim(p_headline));
    IF v_recent_h > 0 THEN
      v_violations := v_violations || jsonb_build_object('rule','headline_repeat_within_lookback','lookback',v_rules.copy_repeat_lookback);
    END IF;
  END IF;

  IF p_overlay IS NOT NULL AND length(btrim(p_overlay)) > 0 THEN
    SELECT count(*) INTO v_recent_o FROM (
      SELECT overlay_text FROM public.pinterest_pin_queue
      WHERE status = 'published'
      ORDER BY posted_at DESC NULLS LAST
      LIMIT v_rules.copy_repeat_lookback
    ) t WHERE lower(btrim(t.overlay_text)) = lower(btrim(p_overlay));
    IF v_recent_o > 0 THEN
      v_violations := v_violations || jsonb_build_object('rule','overlay_repeat_within_lookback','lookback',v_rules.copy_repeat_lookback);
    END IF;
  END IF;

  IF p_cta IS NOT NULL AND length(btrim(p_cta)) > 0 THEN
    SELECT count(*) INTO v_recent_c FROM (
      SELECT meta->>'cta' AS cta FROM public.pinterest_pin_queue
      WHERE status = 'published'
      ORDER BY posted_at DESC NULLS LAST
      LIMIT v_rules.copy_repeat_lookback
    ) t WHERE lower(btrim(t.cta)) = lower(btrim(p_cta));
    IF v_recent_c > 0 THEN
      v_violations := v_violations || jsonb_build_object('rule','cta_repeat_within_lookback','lookback',v_rules.copy_repeat_lookback);
    END IF;
  END IF;

  -- banned phrase scan
  FOR v_phrase IN SELECT jsonb_array_elements_text(v_rules.banned_phrases) LOOP
    IF (p_headline IS NOT NULL AND position(lower(v_phrase) IN lower(p_headline)) > 0)
       OR (p_overlay IS NOT NULL AND position(lower(v_phrase) IN lower(p_overlay)) > 0)
       OR (p_cta IS NOT NULL AND position(lower(v_phrase) IN lower(p_cta)) > 0) THEN
      v_violations := v_violations || jsonb_build_object('rule','banned_phrase','phrase',v_phrase);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('allowed', jsonb_array_length(v_violations) = 0, 'violations', v_violations, 'enabled', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.governor_check_pin(text,text,text,text,text) TO authenticated, service_role;

-- 4. Product pin coverage view
CREATE OR REPLACE VIEW public.pinterest_product_pin_coverage AS
SELECT
  p.id AS product_id,
  p.slug AS product_slug,
  p.name AS product_name,
  p.category,
  COALESCE(COUNT(q.id) FILTER (WHERE q.status IN ('published','queued','approved','scheduled')), 0) AS active_pin_count,
  MAX(q.posted_at) AS last_published_at
FROM public.products p
LEFT JOIN public.pinterest_pin_queue q ON q.product_slug = p.slug
WHERE p.is_active = true
GROUP BY p.id, p.slug, p.name, p.category;

GRANT SELECT ON public.pinterest_product_pin_coverage TO authenticated, service_role;

-- 5. Runtime settings extension
ALTER TABLE public.pinterest_runtime_settings
  ADD COLUMN IF NOT EXISTS allocation_policy_winners_pct integer NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS creative_pool_governor_enabled boolean NOT NULL DEFAULT true;

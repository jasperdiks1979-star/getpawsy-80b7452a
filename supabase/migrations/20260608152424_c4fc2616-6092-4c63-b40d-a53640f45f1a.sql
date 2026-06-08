
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.pinterest_pin_repair_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_queue_id uuid NOT NULL,
  phase text NOT NULL,
  action text NOT NULL,
  old_slug text,
  new_slug text,
  old_product_id uuid,
  new_product_id uuid,
  confidence integer,
  before_validation_status text,
  before_repair_strategy text,
  before_image_match_score integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pinterest_pin_repair_log TO authenticated;
GRANT ALL ON public.pinterest_pin_repair_log TO service_role;

ALTER TABLE public.pinterest_pin_repair_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read repair log" ON public.pinterest_pin_repair_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_pin_repair_log_phase ON public.pinterest_pin_repair_log(phase, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pin_repair_log_pin ON public.pinterest_pin_repair_log(pin_queue_id);

-- pg_trgm GIN on products.name for fast similarity
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.run_pinterest_mass_repair(p_phase text, p_threshold integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin record;
  v_best record;
  v_count_scanned int := 0;
  v_count_repointed int := 0;
  v_count_skipped int := 0;
  v_count_queued int := 0;
  v_pin_text text;
  v_new_score int;
BEGIN
  FOR v_pin IN
    SELECT q.id, q.product_id, q.product_slug, q.product_name, q.pin_title, q.pin_description,
           q.category_key, q.destination_link, q.validation_status, q.repair_strategy,
           COALESCE(m.score, 0) AS current_score
    FROM pinterest_pin_queue q
    LEFT JOIN pinterest_pin_image_match m ON m.pin_queue_id = q.id
    WHERE q.status = 'posted'
      AND (
        (p_phase = 'phase1' AND q.validation_status = 'valid' AND COALESCE(m.score,0) BETWEEN 60 AND 89)
        OR (p_phase = 'phase2' AND q.validation_status = 'valid' AND COALESCE(m.score,0) < 80)
        OR (p_phase = 'phase3' AND q.validation_status = 'invalid' AND COALESCE(m.score,0) < 60)
      )
  LOOP
    v_count_scanned := v_count_scanned + 1;
    v_pin_text := lower(coalesce(v_pin.pin_title,'') || ' ' || coalesce(v_pin.pin_description,'') || ' ' || coalesce(v_pin.product_name,''));

    -- find best active product by trigram similarity on name, with small category boost
    SELECT p.id, p.slug, p.name, p.category,
           LEAST(100, GREATEST(0, round(100 * similarity(lower(p.name), v_pin_text))::int
             + CASE WHEN v_pin.category_key IS NOT NULL AND lower(p.category) = lower(v_pin.category_key) THEN 12 ELSE 0 END))
             AS conf
      INTO v_best
    FROM products p
    WHERE p.is_active = true
      AND p.image_url IS NOT NULL
      AND p.price IS NOT NULL
      AND p.slug IS NOT NULL
    ORDER BY similarity(lower(p.name), v_pin_text) DESC
    LIMIT 1;

    IF v_best.id IS NULL THEN
      v_count_skipped := v_count_skipped + 1;
      CONTINUE;
    END IF;

    v_new_score := v_best.conf;

    IF v_new_score >= p_threshold AND v_best.slug IS DISTINCT FROM v_pin.product_slug THEN
      UPDATE pinterest_pin_queue
        SET product_id = v_best.id,
            product_slug = v_best.slug,
            product_name = v_best.name,
            destination_link = 'https://getpawsy.pet/products/' || v_best.slug,
            final_resolved_url = 'https://getpawsy.pet/products/' || v_best.slug,
            validation_status = 'valid',
            repair_strategy = 'repointed_' || p_phase,
            image_match_score = v_new_score,
            repaired_at = now(),
            updated_at = now()
      WHERE id = v_pin.id;

      INSERT INTO pinterest_pin_repair_log(pin_queue_id, phase, action, old_slug, new_slug,
        old_product_id, new_product_id, confidence,
        before_validation_status, before_repair_strategy, before_image_match_score,
        notes)
      VALUES (v_pin.id, p_phase, 'repointed', v_pin.product_slug, v_best.slug,
        v_pin.product_id, v_best.id, v_new_score,
        v_pin.validation_status, v_pin.repair_strategy, v_pin.current_score,
        'auto title+category similarity');

      v_count_repointed := v_count_repointed + 1;
    ELSIF p_phase = 'phase3' THEN
      UPDATE pinterest_pin_queue
        SET repair_strategy = 'needs_replacement',
            updated_at = now()
      WHERE id = v_pin.id AND repair_strategy IS DISTINCT FROM 'needs_replacement';

      INSERT INTO pinterest_pin_repair_log(pin_queue_id, phase, action, old_slug, new_slug,
        old_product_id, new_product_id, confidence,
        before_validation_status, before_repair_strategy, before_image_match_score,
        notes)
      VALUES (v_pin.id, p_phase, 'queued_replacement', v_pin.product_slug, v_best.slug,
        v_pin.product_id, v_best.id, v_new_score,
        v_pin.validation_status, v_pin.repair_strategy, v_pin.current_score,
        'confidence below threshold ' || p_threshold);

      v_count_queued := v_count_queued + 1;
    ELSE
      v_count_skipped := v_count_skipped + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'phase', p_phase,
    'threshold', p_threshold,
    'scanned', v_count_scanned,
    'repointed', v_count_repointed,
    'queued_replacement', v_count_queued,
    'skipped', v_count_skipped,
    'completed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_pinterest_mass_repair(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.run_pinterest_mass_repair(text, integer) TO service_role;

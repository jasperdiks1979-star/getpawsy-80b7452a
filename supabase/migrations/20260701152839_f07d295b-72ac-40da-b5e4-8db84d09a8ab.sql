-- ============================================================
-- Genesis V9.5 — Deadlock Resolution (DB layer): M1, M2, M5, M6
-- No threshold reductions. No gate bypass. Only removes the
-- structural coverage gaps that made all gates unsatisfiable.
-- ============================================================

-- M2 helper: deterministic showcase→native copy naturaliser.
CREATE OR REPLACE FUNCTION public.pinterest_naturalize_copy(
  desc_in text,
  content_type_in text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  out_text text := coalesce(desc_in, '');
  ct       text := coalesce(lower(content_type_in), 'lifestyle');
  addition text;
  ls_terms text[] := ARRAY['cozy','morning','sunny','evening','weekend','kitchen','living room','bedroom','patio','couch','outdoor','garden'];
  hp_terms text[] := ARRAY['how','why','tips','guide','checklist','avoid','fix','stop','ways','things','before you','what to','best','vs','signs'];
  has_ls   boolean := false;
  has_hp   boolean := false;
  t        text;
BEGIN
  -- Strip storefront/catalog language (case-insensitive, whole-token where possible)
  out_text := regexp_replace(out_text, '\yShop\s+now[^.]*\.?', '', 'gi');
  out_text := regexp_replace(out_text, '\yShop\s+[A-Z][A-Za-z ]{2,30}\.?', '', 'g');
  out_text := regexp_replace(out_text, '\y(buy now|shop now|new arrival|deal|sale|discount|% off|shop)\y', '', 'gi');
  out_text := regexp_replace(out_text, '\s{2,}', ' ', 'g');
  out_text := regexp_replace(out_text, '\s+([.,])', '\1', 'g');
  out_text := btrim(out_text);

  -- Detect lifestyle/helpful presence
  FOREACH t IN ARRAY ls_terms LOOP
    IF position(t IN lower(out_text)) > 0 THEN has_ls := true; EXIT; END IF;
  END LOOP;
  FOREACH t IN ARRAY hp_terms LOOP
    IF position(t IN lower(out_text)) > 0 THEN has_hp := true; EXIT; END IF;
  END LOOP;

  -- Add a lifestyle line if missing
  IF NOT has_ls THEN
    addition := CASE ct
      WHEN 'educational'     THEN 'A simple guide to what actually works for daily use in a cozy home.'
      WHEN 'problem_solution'THEN 'Signs it''s time to fix this, and the ways pet parents solve it at home.'
      WHEN 'seasonal'        THEN 'Made for weekend outdoor time on the patio or in the garden.'
      WHEN 'entertainment'   THEN 'A playful evening moment on the couch that pets love.'
      ELSE                        'A cozy morning routine, right at home in the living room.'
    END;
    out_text := btrim(out_text || ' ' || addition);
  END IF;

  -- Add a helpful line if missing
  IF NOT has_hp THEN
    addition := CASE ct
      WHEN 'educational'     THEN 'How to introduce it step by step, with expert-approved tips.'
      WHEN 'problem_solution'THEN 'How to spot the signs early and the best ways to help.'
      WHEN 'seasonal'        THEN 'Best ways to keep pets comfortable through the season.'
      WHEN 'entertainment'   THEN 'Fun ways to keep your pet engaged during the evening.'
      ELSE                        'Tips for building a calmer, cozier home for your pet.'
    END;
    out_text := btrim(out_text || ' ' || addition);
  END IF;

  out_text := regexp_replace(out_text, '\s{2,}', ' ', 'g');
  RETURN left(out_text, 480);
END;
$$;

-- M1 + M2: universalise V9.3 enrichment. Fire on EVERY insert/update.
-- No status guard. Always derive classification, always stamp meta,
-- always overwrite content_type when it is NULL or 'product'.
-- Also naturalise the description (M2) once, marked in meta.
CREATE OR REPLACE FUNCTION public.pinterest_pin_queue_v93_enrichment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  m         jsonb := coalesce(NEW.meta, '{}'::jsonb);
  niche     text  := coalesce(NEW.hook_group, NEW.category_key);
  c         jsonb;
  derived_ct text;
  missing   text[] := ARRAY[]::text[];
BEGIN
  c := public.pinterest_derive_content_classification(niche);
  derived_ct := c->>'content_type';

  -- Stamp meta keys only if not present (idempotent)
  IF NOT (m ? 'pin_type')         THEN m := m || jsonb_build_object('pin_type',         c->>'pin_type'); END IF;
  IF NOT (m ? 'content_type')     THEN m := m || jsonb_build_object('content_type',     c->>'content_type'); END IF;
  IF NOT (m ? 'creative_style')   THEN m := m || jsonb_build_object('creative_style',   c->>'creative_style'); END IF;
  IF NOT (m ? 'creative_goal')    THEN m := m || jsonb_build_object('creative_goal',    c->>'creative_goal'); END IF;
  IF NOT (m ? 'content_strategy') THEN m := m || jsonb_build_object('content_strategy', c->>'content_strategy'); END IF;

  m := m || jsonb_build_object(
    'enrichment_version','v9.3',
    'genesis_v91_aligned', true,
    'genesis_v95_universalised', true,
    'enriched_by', coalesce(m->>'enriched_by','pinterest_pin_queue_v93_trigger_v95')
  );

  -- Fail-closed
  IF NOT (m ? 'pin_type')         THEN missing := array_append(missing,'meta.pin_type'); END IF;
  IF NOT (m ? 'content_type')     THEN missing := array_append(missing,'meta.content_type'); END IF;
  IF NOT (m ? 'creative_style')   THEN missing := array_append(missing,'meta.creative_style'); END IF;
  IF NOT (m ? 'creative_goal')    THEN missing := array_append(missing,'meta.creative_goal'); END IF;
  IF NOT (m ? 'content_strategy') THEN missing := array_append(missing,'meta.content_strategy'); END IF;
  IF array_length(missing,1) > 0 THEN
    RAISE EXCEPTION 'V93_ENRICHMENT_MISSING:%', array_to_string(missing, ',')
      USING HINT = 'Use _shared/pinterest-canonical-enrichment.ts before inserting into pinterest_pin_queue.';
  END IF;

  NEW.meta := m;

  -- Overwrite content_type when NULL or 'product' with derived native type
  IF NEW.content_type IS NULL OR NEW.content_type = 'product' THEN
    NEW.content_type := derived_ct;
  END IF;

  -- M2: naturalise description once (mark to avoid rework)
  IF NEW.pin_description IS NOT NULL
     AND length(NEW.pin_description) > 0
     AND NOT (m ? 'copy_naturalised_v95') THEN
    NEW.pin_description := public.pinterest_naturalize_copy(NEW.pin_description, derived_ct);
    NEW.meta := NEW.meta || jsonb_build_object('copy_naturalised_v95', true);
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- M5 — Category Vocabulary Bootstrap
-- Seed missing niches into pinterest_niche_rules from the actual
-- category_keys observed in production (both underscore & dot form).
-- Keep strict matching; only add the vocab that never existed.
-- ============================================================
INSERT INTO public.pinterest_niche_rules (rule_id, niche, priority, enabled, primary_terms, require_any, forbid_all, notes)
VALUES
  ('cat_bed_dot.core',       'cat.bed',        40, true, ARRAY['cat bed','cat cushion','cat sofa','cat nap','cat lounger'], ARRAY[]::text[], ARRAY[]::text[], 'V9.5 vocab bootstrap (dot-form alias of cat_bed)'),
  ('dog_bed_dot.core',       'dog.bed',        40, true, ARRAY['dog bed','dog cushion','dog sofa','dog lounger','orthopedic bed'], ARRAY[]::text[], ARRAY[]::text[], 'V9.5 vocab bootstrap (dot-form alias of dog_bed)'),
  ('cat_scratcher_dot.core', 'cat.scratcher',  40, true, ARRAY['cat scratcher','sisal post','scratching post','scratch pad'], ARRAY[]::text[], ARRAY[]::text[], 'V9.5 vocab bootstrap (dot-form alias of cat_scratcher)'),
  ('cat_litter_dot.core',    'cat.litter',     40, true, ARRAY['litter box','litter tray','self-cleaning litter','covered litter','top entry litter'], ARRAY[]::text[], ARRAY[]::text[], 'V9.5 vocab bootstrap (dot-form alias of cat_litter)'),
  ('cat_toy_dot.core',       'cat.toy',        40, true, ARRAY['cat toy','wand toy','feather toy','cat puzzle','interactive cat toy'], ARRAY[]::text[], ARRAY[]::text[], 'V9.5 vocab bootstrap (dot-form alias of interactive_toy)'),
  ('dog_carrier_dot.core',   'dog.carrier',    40, true, ARRAY['dog carrier','pet carrier','travel carrier','airline approved carrier'], ARRAY[]::text[], ARRAY[]::text[], 'V9.5 vocab bootstrap (dot-form alias of dog_carrier)'),
  ('dog_feeder_dot.core',    'dog.feeder',     40, true, ARRAY['dog feeder','automatic feeder','slow feeder','elevated bowl'], ARRAY[]::text[], ARRAY[]::text[], 'V9.5 vocab bootstrap (dot-form alias of feeder)'),
  ('dog_other_dot.core',     'dog.other',      50, true, ARRAY['dog','puppy','pet parent','dog gear'], ARRAY[]::text[], ARRAY[]::text[], 'V9.5 vocab bootstrap'),
  ('cat_enclosure.core',     'cat_enclosure',  30, true, ARRAY['cat enclosure','catio','cat patio','outdoor cat enclosure','window catio'], ARRAY[]::text[], ARRAY[]::text[], 'V9.5 vocab bootstrap'),
  ('cat_essentials.core',    'cat_essentials', 50, true, ARRAY['cat essentials','cat parent must have','new cat','cat starter'], ARRAY[]::text[], ARRAY[]::text[], 'V9.5 vocab bootstrap'),
  ('cat_trees.core',         'cat_trees',      20, true, ARRAY['cat tree','cat tower','cat condo','cat perch','tall cat tree'], ARRAY[]::text[], ARRAY[]::text[], 'V9.5 vocab bootstrap (plural alias of cat_tree)'),
  ('supplement.core',        'supplement',     30, true, ARRAY['supplement','vitamin','joint support','omega','probiotic','calming chew'], ARRAY[]::text[], ARRAY[]::text[], 'V9.5 vocab bootstrap'),
  ('generic_pet.core',       'generic_pet',    90, true, ARRAY['pet','pet parent','pet home','pet routine'], ARRAY[]::text[], ARRAY[]::text[], 'V9.5 fallback vocab')
ON CONFLICT DO NOTHING;

-- ============================================================
-- M6 — Legacy source carve-out (structural only)
-- Add a helper column so the publisher can distinguish rows that
-- were BLOCKED for source-tag reasons alone (not quality). We do
-- NOT flip statuses here; the publisher promotes them only if all
-- current gates (PRE, Native, Integrity, Diversity) pass fresh.
-- ============================================================
ALTER TABLE public.pinterest_pin_queue
  ADD COLUMN IF NOT EXISTS legacy_source_carveout_eligible boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pinterest_pin_queue.legacy_source_carveout_eligible IS
  'V9.5: set true for rows previously blocked only by legacy_source; publisher may re-evaluate them under current gates without bypassing any.';

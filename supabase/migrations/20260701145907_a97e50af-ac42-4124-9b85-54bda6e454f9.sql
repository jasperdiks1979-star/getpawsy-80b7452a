
-- Expand allowed content_type values to canonical Native taxonomy.
ALTER TABLE public.pinterest_pin_queue
  DROP CONSTRAINT IF EXISTS pinterest_pin_queue_content_type_check;
ALTER TABLE public.pinterest_pin_queue
  ADD CONSTRAINT pinterest_pin_queue_content_type_check
  CHECK (content_type IS NULL OR content_type = ANY (ARRAY[
    'lifestyle','educational','problem_solution','seasonal','entertainment',
    'guide','comparison','product'
  ]));

CREATE OR REPLACE FUNCTION public.pinterest_derive_content_classification(niche text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE n text := lower(coalesce(niche, ''));
BEGIN
  IF n ~ '(training|dental|grooming|feeder|bowl_station|fountain|interactive_toy|supplement|potty)' THEN
    RETURN jsonb_build_object('content_type','educational','pin_type','educational','creative_style','helpful_guide','creative_goal','teach_and_earn_save','content_strategy','how_to_do_it_right');
  ELSIF n ~ '(litter|pet_camera|dog_car|carrier|gps|harness)' THEN
    RETURN jsonb_build_object('content_type','problem_solution','pin_type','problem_solution','creative_style','before_after_story','creative_goal','solve_pet_parent_pain','content_strategy','problem_first_then_fix');
  ELSIF n ~ '(scratcher|treats)' THEN
    RETURN jsonb_build_object('content_type','entertainment','pin_type','entertainment','creative_style','playful_moment','creative_goal','spark_delight_and_save','content_strategy','pet_joy_first');
  ELSIF n ~ '(outdoor|enclosure|clothing)' THEN
    RETURN jsonb_build_object('content_type','seasonal','pin_type','seasonal','creative_style','seasonal_scene','creative_goal','seasonal_relevance','content_strategy','right_product_right_season');
  ELSE
    RETURN jsonb_build_object('content_type','lifestyle','pin_type','lifestyle','creative_style','cozy_home_scene','creative_goal','inspire_and_earn_save','content_strategy','real_home_pet_routine');
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.pinterest_pin_queue_v93_enrichment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  m       jsonb := coalesce(NEW.meta, '{}'::jsonb);
  niche   text  := coalesce(NEW.hook_group, NEW.category_key);
  c       jsonb;
  missing text[] := ARRAY[]::text[];
BEGIN
  IF NEW.status IS NULL
     OR NEW.status IN ('draft','queued','pending','ready','blocked_legacy_source') THEN
    c := public.pinterest_derive_content_classification(niche);
    IF NOT (m ? 'pin_type')          THEN m := m || jsonb_build_object('pin_type',          c->>'pin_type'); END IF;
    IF NOT (m ? 'content_type')      THEN m := m || jsonb_build_object('content_type',      c->>'content_type'); END IF;
    IF NOT (m ? 'creative_style')    THEN m := m || jsonb_build_object('creative_style',    c->>'creative_style'); END IF;
    IF NOT (m ? 'creative_goal')     THEN m := m || jsonb_build_object('creative_goal',     c->>'creative_goal'); END IF;
    IF NOT (m ? 'content_strategy')  THEN m := m || jsonb_build_object('content_strategy',  c->>'content_strategy'); END IF;
    m := m || jsonb_build_object(
      'enrichment_version','v9.3','genesis_v91_aligned', true,
      'enriched_by', coalesce(m->>'enriched_by','pinterest_pin_queue_v93_trigger'));

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
    IF NEW.content_type IS NULL OR NEW.content_type = 'product' THEN
      NEW.content_type := m->>'content_type';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS pinterest_pin_queue_v93_enrichment_trg ON public.pinterest_pin_queue;
CREATE TRIGGER pinterest_pin_queue_v93_enrichment_trg
BEFORE INSERT OR UPDATE ON public.pinterest_pin_queue
FOR EACH ROW EXECUTE FUNCTION public.pinterest_pin_queue_v93_enrichment();

-- Backfill existing draft/queued rows in place.
UPDATE public.pinterest_pin_queue q
SET meta = coalesce(q.meta,'{}'::jsonb)
        || public.pinterest_derive_content_classification(coalesce(q.hook_group, q.category_key))
        || jsonb_build_object('enrichment_version','v9.3','genesis_v91_aligned', true,
                              'enriched_by','pinterest_pin_queue_v93_backfill'),
    content_type = CASE
      WHEN q.content_type IS NULL OR q.content_type = 'product'
        THEN public.pinterest_derive_content_classification(coalesce(q.hook_group, q.category_key))->>'content_type'
      ELSE q.content_type
    END
WHERE q.status IN ('draft','queued','pending','ready','blocked_legacy_source')
  AND (q.meta IS NULL
    OR NOT (q.meta ? 'pin_type')
    OR NOT (q.meta ? 'content_type')
    OR NOT (q.meta ? 'creative_style')
    OR NOT (q.meta ? 'creative_goal')
    OR NOT (q.meta ? 'content_strategy'));

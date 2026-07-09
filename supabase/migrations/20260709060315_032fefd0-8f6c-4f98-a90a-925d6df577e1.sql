-- Add a BEFORE INSERT/UPDATE trigger that populates classified_channel
-- using the best-available first-touch or current-session signals.
-- Runs AFTER the existing lock trigger (alphabetical order on trigger name).

CREATE OR REPLACE FUNCTION public.canonical_sessions_set_classified_channel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  eff_ref  text := COALESCE(NULLIF(NEW.first_referrer,''), NEW.referrer);
  eff_src  text := COALESCE(NULLIF(NEW.first_utm_source,''), NEW.utm_source);
  eff_med  text := COALESCE(NULLIF(NEW.first_utm_medium,''), NEW.utm_medium);
  ids jsonb := '{}'::jsonb;
BEGIN
  IF NEW.first_gclid            IS NOT NULL THEN ids := ids || jsonb_build_object('gclid', NEW.first_gclid); END IF;
  IF NEW.first_fbclid           IS NOT NULL THEN ids := ids || jsonb_build_object('fbclid', NEW.first_fbclid); END IF;
  IF NEW.first_ttclid           IS NOT NULL THEN ids := ids || jsonb_build_object('ttclid', NEW.first_ttclid); END IF;
  IF NEW.first_msclkid          IS NOT NULL THEN ids := ids || jsonb_build_object('msclkid', NEW.first_msclkid); END IF;
  IF NEW.first_pinterest_click_id IS NOT NULL THEN ids := ids || jsonb_build_object('pinterest_click_id', NEW.first_pinterest_click_id); END IF;
  IF NEW.first_reddit_click_id  IS NOT NULL THEN ids := ids || jsonb_build_object('reddit_click_id', NEW.first_reddit_click_id); END IF;

  NEW.classified_channel := public.classify_traffic_source(eff_ref, eff_src, eff_med, ids);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonical_sessions_zz_classify ON public.canonical_sessions;
CREATE TRIGGER trg_canonical_sessions_zz_classify
BEFORE INSERT OR UPDATE ON public.canonical_sessions
FOR EACH ROW EXECUTE FUNCTION public.canonical_sessions_set_classified_channel();

-- Backfill existing rows (only where NULL to avoid disturbing locked/known rows)
UPDATE public.canonical_sessions
SET classified_channel = public.classify_traffic_source(
  COALESCE(NULLIF(first_referrer,''), referrer),
  COALESCE(NULLIF(first_utm_source,''), utm_source),
  COALESCE(NULLIF(first_utm_medium,''), utm_medium),
  (CASE WHEN first_gclid IS NOT NULL THEN jsonb_build_object('gclid', first_gclid) ELSE '{}'::jsonb END)
  || (CASE WHEN first_fbclid IS NOT NULL THEN jsonb_build_object('fbclid', first_fbclid) ELSE '{}'::jsonb END)
  || (CASE WHEN first_ttclid IS NOT NULL THEN jsonb_build_object('ttclid', first_ttclid) ELSE '{}'::jsonb END)
  || (CASE WHEN first_msclkid IS NOT NULL THEN jsonb_build_object('msclkid', first_msclkid) ELSE '{}'::jsonb END)
  || (CASE WHEN first_pinterest_click_id IS NOT NULL THEN jsonb_build_object('pinterest_click_id', first_pinterest_click_id) ELSE '{}'::jsonb END)
  || (CASE WHEN first_reddit_click_id IS NOT NULL THEN jsonb_build_object('reddit_click_id', first_reddit_click_id) ELSE '{}'::jsonb END)
)
WHERE classified_channel IS NULL;
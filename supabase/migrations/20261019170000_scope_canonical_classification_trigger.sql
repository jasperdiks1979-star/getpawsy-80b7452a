-- STAGED / NOT FOR DIRECT PRODUCTION EXECUTION WITHOUT RELEASE GATES.
-- Make the existing canonical_sessions classifier fire only for updates to its
-- actual input columns. INSERT classification remains unchanged.
-- Browser-only and shadow-label-only updates no longer reclassify commercial
-- attribution. The first-touch lock and quality-validation triggers stay intact.
-- Verified in isolated Safe Copy with exact copied production classifier functions.
-- Deploy in a controlled maintenance window with a transaction and rollback plan.
BEGIN;
DROP TRIGGER IF EXISTS trg_canonical_sessions_zz_classify ON public.canonical_sessions;
CREATE TRIGGER trg_canonical_sessions_zz_classify
BEFORE INSERT OR UPDATE OF
  referrer, utm_source, utm_medium, user_agent, first_landing_path,
  interaction_count, crawler_identity,
  first_referrer, first_utm_source, first_utm_medium,
  first_gclid, first_fbclid, first_ttclid, first_msclkid,
  first_pinterest_click_id, first_reddit_click_id
ON public.canonical_sessions
FOR EACH ROW EXECUTE FUNCTION public.canonical_sessions_set_classified_channel();
COMMENT ON TRIGGER trg_canonical_sessions_zz_classify ON public.canonical_sessions IS
  'Input-scoped classification: browser/shadow-only updates preserve existing commercial labels. Release gate: staging-tested and reversible.';
COMMIT;
-- Rollback (in a separate transaction; restores original all-UPDATE behavior):
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_canonical_sessions_zz_classify ON public.canonical_sessions;
-- CREATE TRIGGER trg_canonical_sessions_zz_classify BEFORE INSERT OR UPDATE ON public.canonical_sessions
--   FOR EACH ROW EXECUTE FUNCTION public.canonical_sessions_set_classified_channel();
-- COMMIT;

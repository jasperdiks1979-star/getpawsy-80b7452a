-- Helper RPC: average render duration over last 24h
CREATE OR REPLACE FUNCTION public.cinematic_render_avg_seconds_24h()
RETURNS TABLE(avg_seconds numeric, sample_size bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ROUND(AVG(EXTRACT(EPOCH FROM (render_complete_at - render_started_at)))::numeric, 1) AS avg_seconds,
    COUNT(*)::bigint AS sample_size
  FROM public.cinematic_ad_jobs
  WHERE render_started_at IS NOT NULL
    AND render_complete_at IS NOT NULL
    AND render_complete_at > now() - interval '24 hours';
$$;

GRANT EXECUTE ON FUNCTION public.cinematic_render_avg_seconds_24h() TO service_role;
GRANT EXECUTE ON FUNCTION public.cinematic_render_avg_seconds_24h() TO authenticated;

-- Trigger: never let a job leave the render pipeline marked
-- publishable/awaiting_approval if output_mp4_url is still NULL.
CREATE OR REPLACE FUNCTION public.cinematic_enforce_output_mp4()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('publishable','awaiting_approval','published')
     AND NEW.output_mp4_url IS NULL THEN
    NEW.status := 'failed';
    NEW.error_message := COALESCE(NEW.error_message, 'output_mp4_url_missing_before_completion');
    NEW.status_message := 'Auto-blocked: completion attempted without output_mp4_url';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cinematic_enforce_output_mp4 ON public.cinematic_ad_jobs;
CREATE TRIGGER trg_cinematic_enforce_output_mp4
BEFORE UPDATE OF status ON public.cinematic_ad_jobs
FOR EACH ROW
EXECUTE FUNCTION public.cinematic_enforce_output_mp4();
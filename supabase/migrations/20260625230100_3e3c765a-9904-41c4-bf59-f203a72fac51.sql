
CREATE OR REPLACE FUNCTION public.pe_reschedule_crons(p_secret text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  base_url text := 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/';
  jid int;
  result jsonb := '[]'::jsonb;
BEGIN
  IF p_secret IS NULL OR length(p_secret) < 16 THEN
    RAISE EXCEPTION 'invalid secret';
  END IF;

  -- Unschedule any existing pe-* jobs
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname IN ('pe-matrix-15min','pe-operator-15min','pe-daily-report') LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;

  PERFORM cron.schedule(
    'pe-matrix-15min',
    '*/15 * * * *',
    format($cmd$
      select net.http_post(
        url:='%spe-endpoint-matrix',
        headers:=jsonb_build_object('Content-Type','application/json','x-internal-secret',%L,'x-trigger','cron-15min'),
        body:='{}'::jsonb
      );
    $cmd$, base_url, p_secret)
  );

  PERFORM cron.schedule(
    'pe-operator-15min',
    '*/15 * * * *',
    format($cmd$
      select net.http_post(
        url:='%spe-ai-operator',
        headers:=jsonb_build_object('Content-Type','application/json','x-internal-secret',%L,'x-trigger','cron-15min'),
        body:='{}'::jsonb
      );
    $cmd$, base_url, p_secret)
  );

  PERFORM cron.schedule(
    'pe-daily-report',
    '0 4 * * *',
    format($cmd$
      select net.http_post(
        url:='%spe-ai-operator',
        headers:=jsonb_build_object('Content-Type','application/json','x-internal-secret',%L,'x-trigger','cron-daily'),
        body:='{}'::jsonb
      );
    $cmd$, base_url, p_secret)
  );

  SELECT jsonb_agg(jsonb_build_object('jobid',jobid,'jobname',jobname,'schedule',schedule))
    INTO result
    FROM cron.job WHERE jobname IN ('pe-matrix-15min','pe-operator-15min','pe-daily-report');

  RETURN jsonb_build_object('ok', true, 'jobs', result);
END;
$$;

REVOKE ALL ON FUNCTION public.pe_reschedule_crons(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pe_reschedule_crons(text) TO service_role;

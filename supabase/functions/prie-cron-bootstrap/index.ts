import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PE_CRON_SECRET = Deno.env.get("PE_CRON_SECRET")!;

Deno.serve(async () => {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const headers = JSON.stringify({ "Content-Type": "application/json", "x-cron-secret": PE_CRON_SECRET });

  // Rewrite the cron job command with the literal secret.
  const cronSql = `
    SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='prie-auto-orchestrator-15min';
    SELECT cron.schedule(
      'prie-auto-orchestrator-15min',
      '*/15 * * * *',
      $$ SELECT net.http_post(
        url := '${SUPABASE_URL}/functions/v1/prie-auto-orchestrator?trigger=cron',
        headers := '${headers}'::jsonb,
        body := '{}'::jsonb
      ); $$
    );
  `;

  // Rewrite prie_kick to embed the real secret.
  const fnSql = `
    CREATE OR REPLACE FUNCTION public.prie_kick(p_trigger text)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
    DECLARE v_last timestamptz;
    BEGIN
      SELECT (value->>'at')::timestamptz INTO v_last FROM public.prie_settings WHERE key='auto_last_run_at';
      IF v_last IS NOT NULL AND v_last > now() - interval '5 minutes' THEN RETURN; END IF;
      INSERT INTO public.prie_settings(key,value,description)
      VALUES ('auto_last_run_at', jsonb_build_object('at', now(),'trigger', p_trigger), 'PRIE auto orchestrator last run')
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now();
      PERFORM net.http_post(
        url := '${SUPABASE_URL}/functions/v1/prie-auto-orchestrator?trigger='||p_trigger,
        headers := '${headers}'::jsonb,
        body := '{}'::jsonb
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END; $body$;
  `;

  const { error: e1 } = await sb.rpc("exec_sql", { sql: cronSql }).catch(() => ({ error: "no_rpc" } as any));
  // If exec_sql RPC does not exist, fall back: use pg via supabase-js is not possible. Return SQL for the agent to run.
  return new Response(
    JSON.stringify({ ok: true, hint: "Run SQL in migration tool if RPC missing", cronSql, fnSql, e1 }),
    { headers: { "Content-Type": "application/json" } }
  );
});
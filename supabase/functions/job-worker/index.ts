import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BACKOFF_MINUTES = [1, 5, 15, 60, 360]; // 1m, 5m, 15m, 1h, 6h
const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Pick due jobs (limit 10 per run)
    const { data: jobs, error: fetchErr } = await supabase
      .from('marketing_jobs')
      .select('*')
      .in('status', ['queued', 'failed'])
      .lte('next_run_at', new Date().toISOString())
      .order('next_run_at', { ascending: true })
      .limit(10);

    if (fetchErr) throw fetchErr;
    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const job of jobs) {
      // Lock the job
      await supabase.from('marketing_jobs').update({ status: 'running' }).eq('id', job.id);

      try {
        // Call marketing-proxy to handle the provider request
        const proxyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/marketing-proxy`;
        const res = await fetch(proxyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            provider: job.provider,
            action: job.job_type,
            payload: job.payload,
          }),
        });

        const result = await res.json();

        if (result.ok) {
          await supabase.from('marketing_jobs').update({ status: 'success' }).eq('id', job.id);
          succeeded++;
        } else {
          throw new Error(result.reason || 'Provider returned ok:false');
        }
      } catch (err) {
        const attempts = (job.attempts || 0) + 1;
        const newStatus = attempts >= MAX_ATTEMPTS ? 'dead' : 'failed';
        const backoffMinutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
        const nextRun = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

        await supabase.from('marketing_jobs').update({
          status: newStatus,
          attempts,
          last_error: err instanceof Error ? err.message : String(err),
          next_run_at: newStatus === 'dead' ? job.next_run_at : nextRun,
        }).eq('id', job.id);

        // Log failure event
        await supabase.from('marketing_events').insert({
          provider: job.provider,
          event_type: 'job_failed',
          severity: newStatus === 'dead' ? 'error' : 'warn',
          message: err instanceof Error ? err.message : String(err),
          context: { jobId: job.id, attempts, jobType: job.job_type },
        });

        failed++;
      }

      processed++;
    }

    return new Response(
      JSON.stringify({ ok: true, processed, succeeded, failed }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[job-worker] Fatal:', err);
    return new Response(
      JSON.stringify({ ok: false, reason: err instanceof Error ? err.message : 'INTERNAL_ERROR' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Default retry policy — can be overridden per environment via env vars:
//   JOB_WORKER_MAX_ATTEMPTS         (integer, e.g. "5")
//   JOB_WORKER_BACKOFF_MINUTES      (comma-separated list, e.g. "1,5,15,60,360")
//   JOB_WORKER_BATCH_SIZE           (integer, e.g. "10")
const DEFAULT_BACKOFF_MINUTES = [1, 5, 15, 60, 360]; // 1m, 5m, 15m, 1h, 6h
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BATCH_SIZE = 10;

function parseBackoff(raw: string | undefined): number[] {
  if (!raw) return DEFAULT_BACKOFF_MINUTES;
  const parsed = raw
    .split(',')
    .map((s) => Number.parseFloat(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return parsed.length > 0 ? parsed : DEFAULT_BACKOFF_MINUTES;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const MAX_ATTEMPTS = parsePositiveInt(Deno.env.get('JOB_WORKER_MAX_ATTEMPTS'), DEFAULT_MAX_ATTEMPTS);
const BACKOFF_MINUTES = parseBackoff(Deno.env.get('JOB_WORKER_BACKOFF_MINUTES'));
const BATCH_SIZE = parsePositiveInt(Deno.env.get('JOB_WORKER_BATCH_SIZE'), DEFAULT_BATCH_SIZE);

console.log(
  `[job-worker] config: maxAttempts=${MAX_ATTEMPTS} backoffMinutes=[${BACKOFF_MINUTES.join(',')}] batchSize=${BATCH_SIZE}`,
);

interface RetryPolicy {
  provider: string | null;
  job_type: string | null;
  max_attempts: number | null;
  backoff_minutes: number[] | null;
}

/**
 * Pick the most-specific enabled policy for a given (provider, job_type).
 * Specificity ranking (highest wins):
 *   1. exact provider + exact job_type
 *   2. exact provider, wildcard job_type (NULL)
 *   3. wildcard provider (NULL), exact job_type
 *   4. both wildcard (effectively a global override)
 * Falls back to env defaults when no policy applies.
 */
function resolvePolicy(
  provider: string,
  jobType: string,
  policies: RetryPolicy[],
): { maxAttempts: number; backoffMinutes: number[]; matched: RetryPolicy | null } {
  const score = (p: RetryPolicy) => {
    let s = 0;
    if (p.provider && p.provider === provider) s += 2;
    if (p.job_type && p.job_type === jobType) s += 1;
    return s;
  };
  const candidates = policies
    .filter(
      (p) =>
        (p.provider === null || p.provider === provider) &&
        (p.job_type === null || p.job_type === jobType),
    )
    .sort((a, b) => score(b) - score(a));
  const matched = candidates[0] ?? null;
  const backoff =
    Array.isArray(matched?.backoff_minutes) && matched.backoff_minutes.length > 0
      ? matched.backoff_minutes.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 0)
      : BACKOFF_MINUTES;
  const maxAttempts =
    matched?.max_attempts && matched.max_attempts > 0 ? matched.max_attempts : MAX_ATTEMPTS;
  return {
    maxAttempts,
    backoffMinutes: backoff.length > 0 ? backoff : BACKOFF_MINUTES,
    matched,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // Load all enabled retry policies once per worker run. Tiny table —
    // safe to fetch in full and filter in-memory rather than per-job RPC.
    const { data: policiesRaw } = await supabase
      .from('job_retry_policies')
      .select('provider, job_type, max_attempts, backoff_minutes')
      .eq('enabled', true);
    const policies = (policiesRaw ?? []) as RetryPolicy[];

    // Pick due jobs (limit configurable via JOB_WORKER_BATCH_SIZE)
    const { data: jobs, error: fetchErr } = await supabase
      .from('marketing_jobs')
      .select('*')
      .in('status', ['queued', 'failed'])
      .lte('next_run_at', new Date().toISOString())
      .order('next_run_at', { ascending: true })
      .limit(BATCH_SIZE);

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

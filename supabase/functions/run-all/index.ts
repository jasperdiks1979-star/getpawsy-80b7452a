import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const STEPS = [
  { key: 'gsc_keyword_sync', label: 'GSC Keyword-Level Sync', critical: true },
  { key: 'crawl_health_check', label: 'Crawl & Health Check', critical: true },
  { key: 'orphan_detection', label: 'Orphan Detection & Internal Link Suggestions', critical: false },
  { key: 'ctr_recovery', label: 'CTR Recovery Suggestions', critical: false },
  { key: 'ranking_push', label: 'Ranking Push Candidates (pos 11–20)', critical: false },
  { key: 'compile_report', label: 'Compile Report JSON', critical: false },
];

const COOLDOWN_MINUTES = 15;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ ok: false, reason: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return new Response(JSON.stringify({ ok: false, reason: 'Invalid token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = claims.claims.sub as string;

  // Admin check
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();

  if (!roleData) {
    return new Response(JSON.stringify({ ok: false, reason: 'Admin access required' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const source = body.source || 'manual';

    // Check for active run (distributed lock)
    const { data: activeRun } = await supabase
      .from('job_runs')
      .select('id, started_at')
      .in('status', ['queued', 'running'])
      .limit(1)
      .maybeSingle();

    if (activeRun) {
      return new Response(JSON.stringify({
        ok: false,
        reason: 'A run is already in progress',
        activeRunId: activeRun.id,
        startedAt: activeRun.started_at,
      }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Cooldown check for manual runs
    if (source === 'manual') {
      const cooldownCutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString();
      const { data: recentRun } = await supabase
        .from('job_runs')
        .select('id, finished_at')
        .eq('source', 'manual')
        .gte('finished_at', cooldownCutoff)
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentRun) {
        const nextAllowed = new Date(new Date(recentRun.finished_at).getTime() + COOLDOWN_MINUTES * 60 * 1000);
        return new Response(JSON.stringify({
          ok: false,
          reason: `Cooldown active. Next manual run allowed at ${nextAllowed.toISOString()}`,
          nextAllowedAt: nextAllowed.toISOString(),
        }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Create job run
    const { data: run, error: runErr } = await supabase
      .from('job_runs')
      .insert({
        source,
        status: 'queued',
        triggered_by: userId,
      })
      .select('id')
      .single();

    if (runErr || !run) throw runErr || new Error('Failed to create run');

    // Create steps
    const stepInserts = STEPS.map((s, i) => ({
      run_id: run.id,
      step_key: s.key,
      step_label: s.label,
      step_order: i + 1,
      status: 'pending',
    }));

    await supabase.from('job_run_steps').insert(stepInserts);

    // Log start
    await supabase.from('job_run_logs').insert({
      run_id: run.id,
      level: 'info',
      message: `Run ${run.id} created (source=${source}) with ${STEPS.length} steps`,
    });

    // Update to running
    const startedAt = new Date().toISOString();
    await supabase.from('job_runs').update({ status: 'running', started_at: startedAt }).eq('id', run.id);

    // Execute steps sequentially
    let allSuccess = true;
    const report: Record<string, unknown> = {};

    for (const step of STEPS) {
      const stepDef = STEPS.find(s => s.key === step.key)!;

      // Mark step running
      await supabase.from('job_run_steps')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('run_id', run.id)
        .eq('step_key', step.key);

      await supabase.from('job_run_logs').insert({
        run_id: run.id,
        step_key: step.key,
        level: 'info',
        message: `Starting: ${step.label}`,
      });

      const stepStart = Date.now();

      try {
        const result = await executeStep(supabase, step.key, run.id);
        const duration = Date.now() - stepStart;

        await supabase.from('job_run_steps')
          .update({
            status: 'success',
            finished_at: new Date().toISOString(),
            duration_ms: duration,
            result,
          })
          .eq('run_id', run.id)
          .eq('step_key', step.key);

        await supabase.from('job_run_logs').insert({
          run_id: run.id,
          step_key: step.key,
          level: 'info',
          message: `Completed: ${step.label} (${duration}ms)`,
        });

        report[step.key] = { status: 'success', duration_ms: duration, result };
      } catch (err) {
        const duration = Date.now() - stepStart;
        const errMsg = err instanceof Error ? err.message : String(err);

        await supabase.from('job_run_steps')
          .update({
            status: 'failed',
            finished_at: new Date().toISOString(),
            duration_ms: duration,
            error_message: errMsg,
          })
          .eq('run_id', run.id)
          .eq('step_key', step.key);

        await supabase.from('job_run_logs').insert({
          run_id: run.id,
          step_key: step.key,
          level: 'error',
          message: `Failed: ${step.label} — ${errMsg}`,
        });

        report[step.key] = { status: 'failed', duration_ms: duration, error: errMsg };

        if (stepDef.critical) {
          allSuccess = false;
          // Skip remaining steps
          await supabase.from('job_run_logs').insert({
            run_id: run.id,
            level: 'error',
            message: `Critical step "${step.label}" failed. Aborting remaining steps.`,
          });

          // Mark remaining as skipped
          for (const remaining of STEPS.slice(STEPS.indexOf(step) + 1)) {
            await supabase.from('job_run_steps')
              .update({ status: 'skipped' })
              .eq('run_id', run.id)
              .eq('step_key', remaining.key);
          }
          break;
        }

        allSuccess = false;
      }
    }

    // Finalize run
    const finishedAt = new Date().toISOString();
    const totalDuration = Date.now() - new Date(startedAt).getTime();

    await supabase.from('job_runs').update({
      status: allSuccess ? 'success' : 'failed',
      finished_at: finishedAt,
      duration_ms: totalDuration,
      report,
    }).eq('id', run.id);

    await supabase.from('job_run_logs').insert({
      run_id: run.id,
      level: allSuccess ? 'info' : 'error',
      message: `Run completed: ${allSuccess ? 'SUCCESS' : 'FAILED'} (${totalDuration}ms)`,
    });

    return new Response(JSON.stringify({
      ok: true,
      runId: run.id,
      status: allSuccess ? 'success' : 'failed',
      duration_ms: totalDuration,
      report,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[run-all] Fatal:', err);
    return new Response(JSON.stringify({
      ok: false,
      reason: err instanceof Error ? err.message : 'INTERNAL_ERROR',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Step executor — each step calls the relevant existing edge function or runs logic directly
async function executeStep(
  supabase: ReturnType<typeof createClient>,
  stepKey: string,
  runId: string,
): Promise<Record<string, unknown>> {
  const baseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  switch (stepKey) {
    case 'gsc_keyword_sync': {
      // Call existing GSC sync function
      const res = await fetch(`${baseUrl}/functions/v1/fetch-keyword-rankings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ source: 'manual_run', runId }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 200) throw new Error(data.error || data.reason || `GSC sync failed (${res.status})`);
      return { synced: true, ...data };
    }

    case 'crawl_health_check': {
      // Call existing domain health check
      const res = await fetch(`${baseUrl}/functions/v1/domain-health-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ source: 'manual_run', runId }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 200) throw new Error(data.error || data.reason || `Health check failed (${res.status})`);
      return { checked: true, ...data };
    }

    case 'orphan_detection': {
      // Call authority engine for orphan detection
      const res = await fetch(`${baseUrl}/functions/v1/authority-engine`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ action: 'detect_orphans', source: 'manual_run', runId }),
      });
      const data = await res.json();
      return { orphansDetected: true, ...data };
    }

    case 'ctr_recovery': {
      // Query GSC data for low-CTR pages and generate suggestions
      const { data: lowCtrPages } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .gt('impressions', 50)
        .lt('ctr', 0.02)
        .lte('position', 20)
        .order('impressions', { ascending: false })
        .limit(20);

      const suggestions = (lowCtrPages || []).map(p => ({
        page: p.page,
        query: p.query,
        impressions: p.impressions,
        ctr: p.ctr,
        position: p.position,
        suggestion: `Improve title/meta for "${p.query}" (pos ${p.position}, CTR ${(p.ctr * 100).toFixed(1)}%)`,
      }));

      return { count: suggestions.length, suggestions };
    }

    case 'ranking_push': {
      // Find pages ranking 11-20 with significant impressions
      const { data: pushCandidates } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .gte('position', 11)
        .lte('position', 20)
        .gt('impressions', 30)
        .order('impressions', { ascending: false })
        .limit(15);

      return { count: (pushCandidates || []).length, candidates: pushCandidates || [] };
    }

    case 'compile_report': {
      // Gather all step results for this run
      const { data: steps } = await supabase
        .from('job_run_steps')
        .select('step_key, status, duration_ms, result, error_message')
        .eq('run_id', runId)
        .order('step_order');

      const summary = {
        timestamp: new Date().toISOString(),
        runId,
        steps: (steps || []).map(s => ({
          key: s.step_key,
          status: s.status,
          duration_ms: s.duration_ms,
          hasResult: !!s.result,
          error: s.error_message,
        })),
        totalSteps: steps?.length || 0,
        successSteps: steps?.filter(s => s.status === 'success').length || 0,
        failedSteps: steps?.filter(s => s.status === 'failed').length || 0,
      };

      return summary;
    }

    default:
      return { skipped: true, reason: `Unknown step: ${stepKey}` };
  }
}

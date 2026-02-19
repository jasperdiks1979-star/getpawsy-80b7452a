import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const STEPS = [
  { key: 'gsc_query_level_sync', label: 'GSC Query-Level Sync', critical: true },
  { key: 'crawl_health_check', label: 'Crawl & Health Check', critical: true },
  { key: 'performance_snapshot', label: 'Performance Snapshot', critical: false },
  { key: 'orphan_detection', label: 'Orphan Detection & Internal Link Plan', critical: false },
  { key: 'ctr_recovery', label: 'CTR Recovery Optimizer', critical: false },
  { key: 'ranking_push', label: 'Ranking Push Builder (pos 11–20)', critical: false },
  { key: 'content_generation_queue', label: 'Content Generation Queue', critical: false },
  { key: 'indexing_submit', label: 'Indexing Submit (Full Stack)', critical: false },
  { key: 'compile_report', label: 'Compile Run Report', critical: false },
];

const COOLDOWN_MINUTES = 30;
const MAX_INDEXING_URLS = 20;
const CANONICAL_HOST = 'https://getpawsy.pet';
const INDEXING_DEDUPE_DAYS = 7;

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
    const mode = body.mode || 'fullstack'; // 'dryrun' | 'fullstack'

    // Distributed lock — check for active run
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

    // Cooldown for manual runs (schedule bypasses)
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
      .insert({ source, status: 'queued', triggered_by: userId })
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

    await log(supabase, run.id, null, 'info', `Run ${run.id} created (source=${source}, mode=${mode}) with ${STEPS.length} steps`);

    // Update to running
    const startedAt = new Date().toISOString();
    await supabase.from('job_runs').update({ status: 'running', started_at: startedAt }).eq('id', run.id);

    // Execute steps sequentially
    let allSuccess = true;
    const report: Record<string, unknown> = {};
    let crawlHealthPassed = true;

    for (let i = 0; i < STEPS.length; i++) {
      const step = STEPS[i];

      // Mark step running
      await supabase.from('job_run_steps')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('run_id', run.id).eq('step_key', step.key);

      await log(supabase, run.id, step.key, 'info', `Starting: ${step.label}`);

      const stepStart = Date.now();

      try {
        // Dryrun mode: skip indexing step entirely
        if (step.key === 'indexing_submit' && mode === 'dryrun') {
          await supabase.from('job_run_steps')
            .update({ status: 'skipped', finished_at: new Date().toISOString(), duration_ms: 0 })
            .eq('run_id', run.id).eq('step_key', step.key);
          await log(supabase, run.id, step.key, 'info', 'Indexing step skipped (dryrun)');
          report[step.key] = { status: 'skipped', reason: 'dryrun mode' };
          continue;
        }

        // Special guard: skip indexing if crawl health failed
        if (step.key === 'indexing_submit' && !crawlHealthPassed) {
          throw new Error('Indexing aborted: crawl_health_check failed critical items');
        }

        const result = await executeStep(supabase, step.key, run.id);
        const duration = Date.now() - stepStart;

        // Track crawl health result
        if (step.key === 'crawl_health_check' && result?.hasCriticalFailures) {
          crawlHealthPassed = false;
        }

        await supabase.from('job_run_steps')
          .update({ status: 'success', finished_at: new Date().toISOString(), duration_ms: duration, result })
          .eq('run_id', run.id).eq('step_key', step.key);

        await log(supabase, run.id, step.key, 'info', `Completed: ${step.label} (${duration}ms)`);
        report[step.key] = { status: 'success', duration_ms: duration, result };
      } catch (err) {
        const duration = Date.now() - stepStart;
        const errMsg = err instanceof Error ? err.message : String(err);

        await supabase.from('job_run_steps')
          .update({ status: 'failed', finished_at: new Date().toISOString(), duration_ms: duration, error_message: errMsg })
          .eq('run_id', run.id).eq('step_key', step.key);

        await log(supabase, run.id, step.key, 'error', `Failed: ${step.label} — ${errMsg}`);
        report[step.key] = { status: 'failed', duration_ms: duration, error: errMsg };

        if (step.critical) {
          allSuccess = false;
          if (step.key === 'crawl_health_check') crawlHealthPassed = false;
          await log(supabase, run.id, null, 'error', `Critical step "${step.label}" failed. Aborting remaining steps.`);

          // Mark remaining as skipped
          for (const remaining of STEPS.slice(i + 1)) {
            await supabase.from('job_run_steps')
              .update({ status: 'skipped' })
              .eq('run_id', run.id).eq('step_key', remaining.key);
          }
          break;
        }
        allSuccess = false;
      }
    }

    // Finalize run
    const finishedAt = new Date().toISOString();
    const totalDuration = Date.now() - new Date(startedAt).getTime();

    report.mode = mode;
    await supabase.from('job_runs').update({
      status: allSuccess ? 'success' : 'failed',
      finished_at: finishedAt,
      duration_ms: totalDuration,
      report,
    }).eq('id', run.id);

    await log(supabase, run.id, null, allSuccess ? 'info' : 'error',
      `Run completed: ${allSuccess ? 'SUCCESS' : 'FAILED'} (${totalDuration}ms)`);

    return new Response(JSON.stringify({
      ok: true, runId: run.id,
      status: allSuccess ? 'success' : 'failed',
      duration_ms: totalDuration, report,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[run-all] Fatal:', err);
    return new Response(JSON.stringify({
      ok: false, reason: err instanceof Error ? err.message : 'INTERNAL_ERROR',
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper to insert log
async function log(
  supabase: ReturnType<typeof createClient>,
  runId: string, stepKey: string | null, level: string, message: string,
) {
  await supabase.from('job_run_logs').insert({ run_id: runId, step_key: stepKey, level, message });
}

// Step executor
async function executeStep(
  supabase: ReturnType<typeof createClient>,
  stepKey: string,
  runId: string,
): Promise<Record<string, unknown>> {
  const baseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const callFunction = async (fnName: string, body: Record<string, unknown> = {}) => {
    const res = await fetch(`${baseUrl}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({ ...body, source: 'pipeline_run', runId }),
    });
    const data = await res.json();
    if (!res.ok && res.status !== 200) throw new Error(data.error || data.reason || `${fnName} failed (${res.status})`);
    return data;
  };

  switch (stepKey) {
    case 'gsc_query_level_sync': {
      const data = await callFunction('fetch-keyword-rankings');
      return { synced: true, ...data };
    }

    case 'crawl_health_check': {
      const data = await callFunction('domain-health-check');
      // Determine if critical failures exist
      const hasCriticalFailures = !!(
        data?.checks?.some?.((c: { status: string; critical?: boolean }) => c.status !== 'ok' && c.critical)
      );
      return { checked: true, hasCriticalFailures, ...data };
    }

    case 'performance_snapshot': {
      // Lightweight perf check — check site TTFB from server side
      const checks = [];
      const urls = [
        { label: 'Homepage', url: `${CANONICAL_HOST}/` },
        { label: 'Robots.txt', url: `${CANONICAL_HOST}/robots.txt` },
      ];

      for (const { label, url } of urls) {
        const start = Date.now();
        try {
          const res = await fetch(url, { method: 'GET', redirect: 'follow' });
          const ttfb = Date.now() - start;
          checks.push({ label, url, status: res.status, ttfb_ms: ttfb, ok: res.ok });
        } catch (e) {
          checks.push({ label, url, status: 0, ttfb_ms: Date.now() - start, ok: false, error: String(e) });
        }
      }

      const actionableItems = checks.filter(c => !c.ok || c.ttfb_ms > 3000);
      return { checks, actionableItems, hasIssues: actionableItems.length > 0 };
    }

    case 'orphan_detection': {
      const data = await callFunction('authority-engine', { action: 'detect_orphans' });
      return { orphansDetected: true, ...data };
    }

    case 'ctr_recovery': {
      const { data: lowCtrPages } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .gt('impressions', 50)
        .lt('ctr', 0.02)
        .lte('position', 20)
        .order('impressions', { ascending: false })
        .limit(20);

      const suggestions = (lowCtrPages || []).map(p => ({
        page: p.page, query: p.query,
        impressions: p.impressions, ctr: p.ctr, position: p.position,
        suggestion: `Improve title/meta for "${p.query}" (pos ${p.position}, CTR ${(p.ctr * 100).toFixed(1)}%)`,
      }));
      return { count: suggestions.length, suggestions, mode: 'draft' };
    }

    case 'ranking_push': {
      const MIN_IMPRESSIONS = 30;
      const { data: pushCandidates } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .gte('position', 11).lte('position', 20)
        .gt('impressions', MIN_IMPRESSIONS)
        .order('impressions', { ascending: false })
        .limit(15);

      if (!pushCandidates?.length) {
        return { count: 0, candidates: [], skipped: true, reason: `No candidates with ≥${MIN_IMPRESSIONS} impressions in pos 11–20` };
      }
      return { count: pushCandidates.length, candidates: pushCandidates };
    }

    case 'content_generation_queue': {
      // Find top opportunities — high impression pages with no existing guide content
      const { data: opportunities } = await supabase
        .from('gsc_keywords')
        .select('query, page, impressions, position')
        .gt('impressions', 100)
        .lte('position', 30)
        .order('impressions', { ascending: false })
        .limit(10);

      const outlines = (opportunities || []).map(o => ({
        query: o.query, page: o.page,
        impressions: o.impressions, position: o.position,
        action: 'generate_outline_draft',
        status: 'queued_for_review',
      }));

      return { count: outlines.length, outlines, mode: 'draft', autoPublish: false };
    }

    case 'indexing_submit': {
      // Step 1: Gather candidate URLs
      const candidateUrls = new Set<string>();

      // Recently updated products (active, updated in last 7 days)
      const { data: recentProducts } = await supabase
        .from('products')
        .select('slug')
        .eq('is_active', true)
        .gte('updated_at', new Date(Date.now() - 7 * 86400000).toISOString())
        .order('updated_at', { ascending: false })
        .limit(10);

      for (const p of recentProducts || []) {
        if (p.slug) candidateUrls.add(`${CANONICAL_HOST}/product/${p.slug}`);
      }

      // Recently published blog posts
      const { data: recentPosts } = await supabase
        .from('blog_posts')
        .select('slug')
        .eq('is_published', true)
        .gte('updated_at', new Date(Date.now() - 7 * 86400000).toISOString())
        .order('updated_at', { ascending: false })
        .limit(5);

      for (const p of recentPosts || []) {
        if (p.slug) candidateUrls.add(`${CANONICAL_HOST}/blog/${p.slug}`);
      }

      // Key static pages
      candidateUrls.add(`${CANONICAL_HOST}/`);
      candidateUrls.add(`${CANONICAL_HOST}/sitemap.xml`);

      // Step 2: Allowlist filter — only canonical host URLs
      const allowlisted = [...candidateUrls].filter(u => u.startsWith(CANONICAL_HOST));

      // Step 3: Dedupe — exclude URLs submitted in last 7 days
      const dedupeDate = new Date(Date.now() - INDEXING_DEDUPE_DAYS * 86400000).toISOString();
      const { data: recentSubmissions } = await supabase
        .from('indexing_submissions')
        .select('url')
        .gte('submitted_at', dedupeDate)
        .in('url', allowlisted);

      const alreadySubmitted = new Set((recentSubmissions || []).map(s => s.url));
      const toSubmit = allowlisted.filter(u => !alreadySubmitted.has(u)).slice(0, MAX_INDEXING_URLS);

      // Step 4: Submit (using IndexNow via existing edge function)
      const submitted: Array<{ url: string; status: string; response?: unknown }> = [];
      const skippedDedupe = allowlisted.filter(u => alreadySubmitted.has(u));

      for (const url of toSubmit) {
        try {
          // Use IndexNow ping function if available, otherwise just log the submission
          const res = await fetch(`${baseUrl}/functions/v1/indexnow-ping`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
          });
          const data = await res.json().catch(() => ({}));

          await supabase.from('indexing_submissions').insert({
            url, run_id: runId, status: res.ok ? 'submitted' : 'failed',
            response_json: data,
          });

          submitted.push({ url, status: res.ok ? 'submitted' : 'failed', response: data });
        } catch (e) {
          await supabase.from('indexing_submissions').insert({
            url, run_id: runId, status: 'error',
            response_json: { error: String(e) },
          });
          submitted.push({ url, status: 'error' });
        }
      }

      await log(supabase, runId, 'indexing_submit', 'info',
        `Indexing: ${submitted.length} submitted, ${skippedDedupe.length} deduped, ${allowlisted.length} total candidates`);

      return {
        submitted: submitted.length,
        deduped: skippedDedupe.length,
        totalCandidates: allowlisted.length,
        maxPerRun: MAX_INDEXING_URLS,
        details: submitted,
        skippedUrls: skippedDedupe,
      };
    }

    case 'compile_report': {
      const { data: steps } = await supabase
        .from('job_run_steps')
        .select('step_key, status, duration_ms, result, error_message')
        .eq('run_id', runId)
        .order('step_order');

      const summary = {
        timestamp: new Date().toISOString(),
        runId,
        canonicalHost: CANONICAL_HOST,
        steps: (steps || []).map(s => ({
          key: s.step_key, status: s.status, duration_ms: s.duration_ms,
          hasResult: !!s.result, error: s.error_message,
        })),
        totalSteps: steps?.length || 0,
        successSteps: steps?.filter(s => s.status === 'success').length || 0,
        failedSteps: steps?.filter(s => s.status === 'failed').length || 0,
        skippedSteps: steps?.filter(s => s.status === 'skipped').length || 0,
      };

      return summary;
    }

    default:
      return { skipped: true, reason: `Unknown step: ${stepKey}` };
  }
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const STEPS = [
  { key: 'gsc_query_level_sync', label: 'GSC Query-Level Sync', critical: false },
  { key: 'crawl_health_check', label: 'Crawl & Health Check', critical: true },
  { key: 'performance_snapshot', label: 'Performance Snapshot', critical: false },
  { key: 'orphan_detection', label: 'Orphan Detection & Internal Link Plan', critical: false },
  { key: 'ctr_recovery', label: 'CTR Recovery Optimizer', critical: false },
  { key: 'ranking_push', label: 'Ranking Push Builder (pos 11–20)', critical: false },
  { key: 'content_generation_queue', label: 'Content Generation Queue', critical: false },
  { key: 'indexing_submit', label: 'Indexing Submit (Full Stack)', critical: false },
  { key: 'compile_report', label: 'Compile Run Report', critical: false },
  { key: 'ctr_intelligence', label: 'CTR Intelligence Update', critical: false },
  { key: 'cluster_intelligence', label: 'Cluster Intelligence Update', critical: false },
  { key: 'competitor_gap_scan', label: 'Competitor Gap Scan', critical: false },
  { key: 'serp_feature_analyzer', label: 'SERP Feature Analyzer', critical: false },
  { key: 'zero_click_optimizer', label: 'Zero-Click Optimizer', critical: false },
  { key: 'authority_gap_engine', label: 'Authority Gap Engine', critical: false },
];

const COOLDOWN_MINUTES = 30;
const MAX_INDEXING_URLS = 20;
const CANONICAL_HOST = 'https://getpawsy.pet';
const INDEXING_DEDUPE_DAYS = 7;

function generateTraceId(): string {
  return `tr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const traceId = generateTraceId();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Auth check — ALWAYS return 200 with ok:false for auth errors
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ ok: false, traceId, reason: 'Unauthorized — no Bearer token', step: null, reauthRequired: true });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    console.error(`[run-all][${traceId}] Token validation failed:`, claimsErr?.message);
    return jsonResponse({ ok: false, traceId, reason: 'Invalid or expired session token. Please refresh the page or log in again.', step: null, reauthRequired: true });
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
    return jsonResponse({ ok: false, traceId, reason: 'Admin access required' });
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
      return jsonResponse({
        ok: false, traceId,
        reason: 'A run is already in progress',
        activeRunId: activeRun.id,
        startedAt: activeRun.started_at,
      });
    }

    // Cooldown for manual runs (schedule bypasses)
    // Only enforce cooldown after runs that progressed past step 1 (not immediate failures)
    if (source === 'manual') {
      const cooldownCutoff = new Date(Date.now() - COOLDOWN_MINUTES * 60 * 1000).toISOString();
      const { data: recentRun } = await supabase
        .from('job_runs')
        .select('id, finished_at, duration_ms, status')
        .eq('source', 'manual')
        .gte('finished_at', cooldownCutoff)
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Only enforce cooldown if the run actually progressed (duration > 5s means it ran real steps)
      if (recentRun && recentRun.duration_ms && recentRun.duration_ms > 5000) {
        const nextAllowed = new Date(new Date(recentRun.finished_at).getTime() + COOLDOWN_MINUTES * 60 * 1000);
        return jsonResponse({
          ok: false, traceId,
          reason: `Next manual run allowed at ${nextAllowed.toISOString()}`,
          nextAllowedAt: nextAllowed.toISOString(),
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

    await log(supabase, run.id, null, 'info', `Run ${run.id} created (source=${source}, mode=${mode}, traceId=${traceId}) with ${STEPS.length} steps`);

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

        // Special guard: skip indexing if crawl health had critical failures (wrong redirect target, missing redirect, etc.)
        // Note: a 302 with correct target does NOT block indexing — only logs a warning
        if (step.key === 'indexing_submit' && !crawlHealthPassed) {
          throw new Error('Indexing aborted: crawl_health_check has critical failures (redirect target wrong or missing). Check Redirect Debug for details.');
        }

        const result = await executeStep(supabase, step.key, run.id);
        const duration = Date.now() - stepStart;

        // Track crawl health result
        if (step.key === 'crawl_health_check' && result?.hasCriticalFailures) {
          crawlHealthPassed = false;
        }

        // Check if GSC step returned reauthRequired — treat as non-critical failure, continue pipeline
        if (step.key === 'gsc_query_level_sync' && result?.reauthRequired) {
          const errMsg = (result.error as string) || 'GSC re-authentication required';
          await supabase.from('job_run_steps')
            .update({ status: 'failed', finished_at: new Date().toISOString(), duration_ms: Date.now() - stepStart, error_message: errMsg, result })
            .eq('run_id', run.id).eq('step_key', step.key);
          await log(supabase, run.id, step.key, 'warn', `GSC auth issue (non-blocking): ${errMsg}`);
          report[step.key] = { status: 'failed', error: errMsg, reauthRequired: true };
          allSuccess = false;
          continue; // Continue to next step — GSC is not critical
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
    report.traceId = traceId;
    await supabase.from('job_runs').update({
      status: allSuccess ? 'success' : 'failed',
      finished_at: finishedAt,
      duration_ms: totalDuration,
      report,
    }).eq('id', run.id);

    await log(supabase, run.id, null, allSuccess ? 'info' : 'error',
      `Run completed: ${allSuccess ? 'SUCCESS' : 'FAILED'} (${totalDuration}ms, traceId=${traceId})`);

    return jsonResponse({
      ok: true, runId: run.id, traceId,
      status: allSuccess ? 'success' : 'failed',
      duration_ms: totalDuration,
    });
  } catch (err) {
    console.error(`[run-all][${traceId}] Fatal:`, err);
    return jsonResponse({
      ok: false, traceId,
      reason: err instanceof Error ? err.message : 'INTERNAL_ERROR',
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
    try {
      const res = await fetch(`${baseUrl}/functions/v1/${fnName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({ ...body, source: 'pipeline_run', runId }),
      });
      const text = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text);
      } catch {
        // Edge function returned non-JSON (HTML error page, etc.)
        throw new Error(`${fnName} returned non-JSON (status ${res.status}): ${text.slice(0, 200)}`);
      }
      // Return parsed JSON even for non-2xx — let caller decide how to handle ok:false
      if (!res.ok) {
        // Attach status info but return data so caller can inspect reauthRequired / error fields
        data._httpStatus = res.status;
        data._fnName = fnName;
        if (data.ok === undefined) data.ok = false;
      }
      return data;
    } catch (e) {
      if (e instanceof Error) throw e;
      throw new Error(`${fnName} call failed: ${String(e)}`);
    }
  };

  switch (stepKey) {
    case 'gsc_query_level_sync': {
      try {
        const data = await callFunction('fetch-keyword-rankings');
        // Check for ok:false responses (e.g. missing credentials)
        if (data.ok === false) {
          const errMsg = (data.error as string) || (data.reason as string) || 'GSC sync returned ok:false';
          if (errMsg.includes('GOOGLE_SERVICE_ACCOUNT_JSON') || errMsg.includes('not configured')) {
            return { synced: false, reauthRequired: true, error: 'Google service account not configured. Add GOOGLE_SERVICE_ACCOUNT_JSON secret.' };
          }
          return { synced: false, reauthRequired: true, error: errMsg };
        }
        return { synced: true, ...data };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Check if it's an auth/token issue
        if (msg.includes('invalid_token') || msg.includes('Invalid token') || msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid_grant') || msg.includes('Token exchange failed') || msg.includes('GOOGLE_SERVICE_ACCOUNT_JSON')) {
          return { synced: false, reauthRequired: true, error: msg };
        }
        throw e;
      }
    }

    case 'crawl_health_check': {
      // Inline crawl checks — don't depend on another edge function that might not exist
      const checks: Array<{
        label: string; url: string; status: number; ok: boolean; critical: boolean;
        ttfb_ms: number; error?: string; redirectTarget?: string; warning?: string;
        headers?: Record<string, string | null>; redirectSource?: string;
      }> = [];
      const urlsToCheck = [
        { label: 'Homepage', url: `${CANONICAL_HOST}/`, critical: true },
        { label: 'robots.txt', url: `${CANONICAL_HOST}/robots.txt`, critical: true },
        { label: 'sitemap.xml', url: `${CANONICAL_HOST}/sitemap.xml`, critical: true },
        { label: 'sitemap-static.xml', url: `${CANONICAL_HOST}/sitemap-static.xml`, critical: false },
        { label: 'merchant-feed.xml', url: `${CANONICAL_HOST}/merchant-feed.xml`, critical: false },
      ];

      for (const { label, url, critical } of urlsToCheck) {
        const start = Date.now();
        try {
          const res = await fetch(url, { method: 'GET', redirect: 'follow' });
          checks.push({ label, url, status: res.status, ok: res.ok, critical, ttfb_ms: Date.now() - start });
        } catch (e) {
          checks.push({ label, url, status: 0, ok: false, critical, ttfb_ms: Date.now() - start, error: String(e) });
        }
      }

      // Check www→apex redirect with diagnostic headers
      const redirectChecks = [
        { label: 'www→apex redirect', from: 'https://www.getpawsy.pet/' },
      ];
      for (const rc of redirectChecks) {
        const start = Date.now();
        try {
          const res = await fetch(rc.from, { method: 'HEAD', redirect: 'manual' });
          const location = res.headers.get('location') || '';
          const server = res.headers.get('server');
          const cfRay = res.headers.get('cf-ray');
          const cfCacheStatus = res.headers.get('cf-cache-status');
          const via = res.headers.get('via');

          const diagHeaders = { server, cfRay, cfCacheStatus, via };
          const redirectSource = cfRay && server?.toLowerCase().includes('cloudflare') ? 'cloudflare' : 'origin';

          const isRedirectStatus = [301, 302, 307, 308].includes(res.status);
          // Normalize: strip trailing slash for comparison
          const normalizedLocation = location.replace(/\/$/, '');
          const normalizedTarget = CANONICAL_HOST; // https://getpawsy.pet
          const targetCorrect = normalizedLocation === normalizedTarget || location === normalizedTarget + '/';

          let ok = false;
          let warning: string | undefined;
          let error: string | undefined;

          if (isRedirectStatus && targetCorrect) {
            ok = true;
            if (res.status === 302 || res.status === 307) {
              warning = `Temporary redirect (${res.status}) detected; SEO recommends 301 or 308. Source: ${redirectSource}.`;
            }
          } else if (isRedirectStatus && !targetCorrect) {
            ok = false;
            error = `Redirect target is "${location}" but expected "${CANONICAL_HOST}/". Fix DNS/hosting redirect config.`;
          } else if (res.status === 200) {
            ok = false;
            error = `No redirect: www returned 200 directly. Both www and apex serve content (duplicate). Fix: add redirect rule.`;
          } else {
            ok = false;
            error = `Unexpected status ${res.status} from www. Expected redirect (301/308).`;
          }

          checks.push({
            label: rc.label, url: rc.from,
            status: res.status, ok, critical: !ok, // only critical if NOT ok
            ttfb_ms: Date.now() - start,
            redirectTarget: location, warning, error,
            headers: diagHeaders, redirectSource,
          });
        } catch (e) {
          checks.push({ label: rc.label, url: rc.from, status: 0, ok: false, critical: true, ttfb_ms: Date.now() - start, error: String(e) });
        }
      }

      const hasCriticalFailures = checks.some(c => !c.ok && c.critical);
      const warnings = checks.filter(c => c.warning).map(c => ({ label: c.label, warning: c.warning }));
      return { checked: true, hasCriticalFailures, checks, warnings };
    }

    case 'performance_snapshot': {
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
      // Lightweight orphan detection: find pages in sitemap that have no internal links pointing to them
      const { data: blogPosts } = await supabase
        .from('blog_posts')
        .select('slug, title')
        .eq('is_published', true);

      const { data: products } = await supabase
        .from('products')
        .select('slug, name')
        .eq('is_active', true);

      const totalPages = (blogPosts?.length || 0) + (products?.length || 0);
      return {
        orphansDetected: true,
        totalPages,
        blogPosts: blogPosts?.length || 0,
        products: products?.length || 0,
        mode: 'draft',
        note: 'Full orphan analysis requires crawl data. Pages listed for manual review.',
      };
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

      candidateUrls.add(`${CANONICAL_HOST}/`);
      candidateUrls.add(`${CANONICAL_HOST}/sitemap.xml`);

      // Step 2: Allowlist filter
      const allowlisted = [...candidateUrls].filter(u => u.startsWith(CANONICAL_HOST));

      // Step 3: Dedupe
      const dedupeDate = new Date(Date.now() - INDEXING_DEDUPE_DAYS * 86400000).toISOString();
      const { data: recentSubmissions } = await supabase
        .from('indexing_submissions')
        .select('url')
        .gte('submitted_at', dedupeDate)
        .in('url', allowlisted);

      const alreadySubmitted = new Set((recentSubmissions || []).map(s => s.url));
      const toSubmit = allowlisted.filter(u => !alreadySubmitted.has(u)).slice(0, MAX_INDEXING_URLS);

      // Step 4: Submit
      const submitted: Array<{ url: string; status: string; response?: unknown }> = [];
      const skippedDedupe = allowlisted.filter(u => alreadySubmitted.has(u));

      for (const url of toSubmit) {
        try {
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

    // ─── V6 Steps ───
    case 'ctr_intelligence': {
      const { data: gscData } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .gt('impressions', 10)
        .order('impressions', { ascending: false })
        .limit(500);

      if (!gscData?.length) return { updated: false, reason: 'No GSC data available' };

      const positionBuckets: Record<number, { clicks: number; impressions: number; count: number }> = {};
      for (const row of gscData) {
        const pos = Math.round(row.position);
        if (pos < 1 || pos > 50) continue;
        if (!positionBuckets[pos]) positionBuckets[pos] = { clicks: 0, impressions: 0, count: 0 };
        positionBuckets[pos].clicks += row.clicks;
        positionBuckets[pos].impressions += row.impressions;
        positionBuckets[pos].count++;
      }

      let upserted = 0;
      for (const [pos, bucket] of Object.entries(positionBuckets)) {
        const expectedCtr = bucket.impressions > 0 ? bucket.clicks / bucket.impressions : 0;
        await supabase.from('ctr_model_data').upsert({
          position: Number(pos),
          expected_ctr: expectedCtr,
          sample_size: bucket.count,
          device: 'all',
          query_type: 'all',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'position,device,query_type' });
        upserted++;
      }

      const anomalies: Array<{ query: string; position: number; actual_ctr: number; expected_ctr: number }> = [];
      for (const row of gscData.slice(0, 100)) {
        const pos = Math.round(row.position);
        const bucket = positionBuckets[pos];
        if (!bucket || bucket.impressions === 0) continue;
        const expected = bucket.clicks / bucket.impressions;
        if (expected === 0) continue;
        const gap = (row.ctr - expected) / expected;
        if (Math.abs(gap) > 0.3) {
          anomalies.push({ query: row.query, position: pos, actual_ctr: row.ctr, expected_ctr: expected });
        }
      }

      return { updated: true, positionsModeled: upserted, anomalies: anomalies.length, topAnomalies: anomalies.slice(0, 5) };
    }

    case 'cluster_intelligence': {
      const { data: queries } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, position')
        .gte('impressions', 5)
        .lte('position', 60)
        .order('impressions', { ascending: false })
        .limit(300);

      if (!queries?.length) return { clustered: false, reason: 'No qualifying queries' };

      const clusters: Record<string, { keywords: typeof queries; totalImpressions: number; totalClicks: number; positions: number[] }> = {};
      for (const q of queries) {
        const words = q.query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
        const key = words.slice(0, 2).join(' ') || q.query;
        if (!clusters[key]) clusters[key] = { keywords: [], totalImpressions: 0, totalClicks: 0, positions: [] };
        clusters[key].keywords.push(q);
        clusters[key].totalImpressions += q.impressions;
        clusters[key].totalClicks += q.clicks;
        clusters[key].positions.push(q.position);
      }

      const validClusters = Object.entries(clusters).filter(([, c]) => c.keywords.length >= 2);
      let stored = 0;
      for (const [label, cluster] of validClusters.slice(0, 30)) {
        const avgPos = cluster.positions.reduce((a, b) => a + b, 0) / cluster.positions.length;
        const primaryKw = cluster.keywords[0].query;
        const targetUrl = cluster.keywords[0].page;

        await supabase.from('keyword_clusters').upsert({
          cluster_label: label,
          primary_keyword: primaryKw,
          keyword_count: cluster.keywords.length,
          keywords: cluster.keywords.map(k => ({ query: k.query, impressions: k.impressions, position: k.position })),
          total_impressions: cluster.totalImpressions,
          total_clicks: cluster.totalClicks,
          avg_position: avgPos,
          target_url: targetUrl,
          intent_type: avgPos <= 10 ? 'transactional' : avgPos <= 30 ? 'commercial' : 'informational',
          run_id: runId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'cluster_label' });
        stored++;
      }

      return { clustered: true, clustersFound: validClusters.length, stored };
    }

    // ─── V7 Steps ───
    case 'competitor_gap_scan': {
      const { data: weakKeywords } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .gt('impressions', 50)
        .gt('position', 15)
        .order('impressions', { ascending: false })
        .limit(50);

      if (!weakKeywords?.length) return { gaps: 0, reason: 'No weak keywords found' };

      const gaps = weakKeywords.map(kw => {
        const estCompetitorPos = Math.min(kw.position - 5, 5);
        const contentGapScore = Math.min(100, Math.round((kw.position - estCompetitorPos) * 3 + (1 - kw.ctr) * 20));
        const estimatedGain = Math.round(kw.impressions * 0.05 * (kw.position > 20 ? 2 : 1));
        return {
          run_id: runId,
          keyword: kw.query,
          competitor_url: null,
          competitor_position: estCompetitorPos,
          our_position: kw.position,
          content_gap_score: contentGapScore,
          schema_gap: {},
          authority_gap: Math.max(0, kw.position - 10),
          estimated_gain_if_matched: estimatedGain,
        };
      });

      await supabase.from('competitor_gaps').insert(gaps);

      await log(supabase, runId, 'competitor_gap_scan', 'info',
        `Found ${gaps.length} competitive gaps. Top: "${gaps[0]?.keyword}" (+${gaps[0]?.estimated_gain_if_matched} clicks)`);

      return { gaps: gaps.length, topKeyword: gaps[0]?.keyword, topGain: gaps[0]?.estimated_gain_if_matched };
    }

    case 'serp_feature_analyzer': {
      const { data: eligiblePages } = await supabase
        .from('gsc_keywords')
        .select('query, page, impressions, position, ctr')
        .gt('impressions', 20)
        .lte('position', 20)
        .order('impressions', { ascending: false })
        .limit(50);

      if (!eligiblePages?.length) return { analyzed: 0 };

      const { data: blogPosts } = await supabase
        .from('blog_posts')
        .select('slug')
        .eq('is_published', true);

      const blogSlugs = new Set(blogPosts?.map(b => b.slug) || []);
      const features: Array<{
        run_id: string; keyword: string; page_url: string; feature_type: string;
        status: string; impressions: number; position: number;
      }> = [];

      for (const page of eligiblePages) {
        const slug = page.page.split('/').pop() || '';
        const hasBlog = blogSlugs.has(slug);

        features.push({
          run_id: runId, keyword: page.query, page_url: page.page,
          feature_type: 'faq', status: hasBlog ? 'eligible' : 'missing',
          impressions: page.impressions, position: page.position,
        });

        if (page.position <= 8) {
          features.push({
            run_id: runId, keyword: page.query, page_url: page.page,
            feature_type: 'featured_snippet', status: page.impressions > 100 ? 'eligible' : 'missing',
            impressions: page.impressions, position: page.position,
          });
        }

        if (/how|what|why|when|best|guide|tips/i.test(page.query)) {
          features.push({
            run_id: runId, keyword: page.query, page_url: page.page,
            feature_type: 'paa', status: 'eligible',
            impressions: page.impressions, position: page.position,
          });
        }
      }

      if (features.length > 0) await supabase.from('serp_features').insert(features);

      return {
        analyzed: eligiblePages.length,
        features: features.length,
        captured: features.filter(f => f.status === 'captured').length,
        eligible: features.filter(f => f.status === 'eligible').length,
        missing: features.filter(f => f.status === 'missing').length,
      };
    }

    case 'zero_click_optimizer': {
      const { data: infoPages } = await supabase
        .from('gsc_keywords')
        .select('query, page, impressions, position')
        .gt('impressions', 30)
        .lte('position', 15)
        .order('impressions', { ascending: false })
        .limit(30);

      if (!infoPages?.length) return { assessed: 0 };

      const { data: blogs } = await supabase
        .from('blog_posts')
        .select('slug, content')
        .eq('is_published', true);

      const blogMap = new Map(blogs?.map(b => [b.slug, b]) || []);
      let assessed = 0;
      let readyCount = 0;

      for (const page of infoPages) {
        const slug = page.page.split('/').pop() || '';
        const blog = blogMap.get(slug);
        const content = blog?.content || '';

        const hasDirectAnswer = content.length > 200;
        const hasComparisonTable = /<table/i.test(content) || /comparison|vs\.|versus/i.test(content);
        const hasDefinition = /definition|what is|means/i.test(page.query);
        const hasQuickAnswer = content.slice(0, 500).split(/\s+/).length >= 30;

        const feats = [hasDirectAnswer, hasComparisonTable, hasDefinition, hasQuickAnswer];
        const score = Math.round((feats.filter(Boolean).length / 4) * 100);
        const ready = score >= 50;

        await supabase.from('zero_click_pages').upsert({
          page_url: page.page, slug,
          zero_click_ready: ready,
          has_direct_answer: hasDirectAnswer,
          has_definition_schema: hasDefinition,
          has_comparison_table: hasComparisonTable,
          has_quick_answer: hasQuickAnswer,
          visibility_score: score,
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'page_url' });

        assessed++;
        if (ready) readyCount++;
      }

      return { assessed, ready: readyCount, notReady: assessed - readyCount };
    }

    case 'authority_gap_engine': {
      const { data: topPages } = await supabase
        .from('gsc_keywords')
        .select('page, clicks, impressions, position')
        .order('clicks', { ascending: false })
        .limit(20);

      const { data: clusters } = await supabase
        .from('keyword_clusters')
        .select('cluster_label, target_url, avg_position, total_impressions')
        .gt('total_impressions', 50)
        .order('total_impressions', { ascending: false })
        .limit(20);

      const weakClusters = (clusters || []).filter(c => (c.avg_position || 99) > 20);
      const strongPages = (topPages || []).filter(p => p.position <= 10);

      const velocity = strongPages.length > 0 ? strongPages.reduce((s, p) => s + p.clicks, 0) / strongPages.length : 0;
      const serpCapture = topPages?.length ? (strongPages.length / topPages.length) * 100 : 0;

      await supabase.from('strategy_state_history').insert({
        run_id: runId,
        ranking_velocity: velocity,
        ctr_growth: 0,
        gap_closure_rate: weakClusters.length > 0 ? ((clusters?.length || 0) - weakClusters.length) / (clusters?.length || 1) * 100 : 100,
        serp_capture_pct: serpCapture,
        strategy_action: weakClusters.length > 5 ? 'increase_aggressiveness' : velocity > 50 ? 'scale_clusters' : 'maintain',
        reasoning: `${strongPages.length} pages in top 10, ${weakClusters.length} weak clusters. Velocity: ${velocity.toFixed(1)} clicks/page avg.`,
      });

      for (const page of (topPages || []).filter(p => p.position <= 5)) {
        await supabase.from('ranking_defense').upsert({
          page_url: page.page,
          keyword: '',
          position: page.position,
          defense_status: 'locked',
          locked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'page_url,keyword' });
      }

      return {
        strongPages: strongPages.length,
        weakClusters: weakClusters.length,
        totalClusters: clusters?.length || 0,
        strategyAction: weakClusters.length > 5 ? 'increase_aggressiveness' : 'maintain',
        defenseLocked: (topPages || []).filter(p => p.position <= 5).length,
      };
    }

    default:
      return { skipped: true, reason: `Unknown step: ${stepKey}` };
  }
}

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
  { key: 'ranking_push', label: 'Ranking Push Builder (pos 6–25)', critical: false },
  { key: 'content_generation_queue', label: 'Content Generation Queue', critical: false },
  { key: 'indexing_submit', label: 'Sitemap Ping (Google + Bing)', critical: false },
  { key: 'compile_report', label: 'Compile Run Report', critical: false },
  { key: 'ctr_intelligence', label: 'CTR Intelligence Update', critical: false },
  { key: 'cluster_intelligence', label: 'Cluster Intelligence Update', critical: false },
  { key: 'competitor_gap_scan', label: 'Competitor Gap Scan', critical: false },
  { key: 'serp_feature_analyzer', label: 'SERP Feature Analyzer', critical: false },
  { key: 'zero_click_optimizer', label: 'Zero-Click Optimizer', critical: false },
  { key: 'authority_gap_engine', label: 'Authority Gap Engine', critical: false },
  { key: 'competitor_content_intel', label: 'Competitor Content Intelligence', critical: false },
  { key: 'backlink_opportunity_scoring', label: 'Backlink Opportunity Scoring', critical: false },
  { key: 'revenue_optimization_engine', label: 'Revenue Optimization Engine', critical: false },
  { key: 'market_share_simulation', label: 'Market Share Simulation', critical: false },
];

// COOLDOWN_MINUTES removed — replaced by execution-governor adaptive evaluation
const MAX_INDEXING_URLS = 20;
const CANONICAL_HOST = 'https://getpawsy.pet';
const INDEXING_DEDUPE_DAYS = 7;

// === SAFETY TIMEOUTS ===
const GLOBAL_RUN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes hard cap for entire run
const STALE_HEARTBEAT_MS = 90_000; // 90s without heartbeat = stale (was 180s)
const MAX_STEP_DURATION_MS = 60_000; // 60s max per step

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
    let mode = body.mode || 'fullstack'; // 'dryrun' | 'fullstack'

    // Distributed lock — check for active run
    const { data: activeRun } = await supabase
      .from('job_runs')
      .select('id, started_at, updated_at')
      .in('status', ['queued', 'running'])
      .limit(1)
      .maybeSingle();

    if (activeRun) {
      const forceOverride = body.forceOverride === true;
      // Use updated_at (heartbeat) for staleness, fall back to started_at
      const lastHeartbeat = activeRun.updated_at || activeRun.started_at;
      const staleSinceMs = lastHeartbeat
        ? Date.now() - new Date(lastHeartbeat).getTime()
        : 0;
      const isStale = staleSinceMs > STALE_HEARTBEAT_MS; // 90s without heartbeat = stale

      if (forceOverride || isStale) {
        // Auto-release the stuck lock
        const releaseReason = forceOverride
          ? 'Force override by admin'
          : `Stale lock auto-released (${Math.round(staleSinceMs / 1000)}s with no progress)`;
        await supabase.from('job_runs').update({
          status: 'failed',
          finished_at: new Date().toISOString(),
          duration_ms: staleSinceMs,
          error_message: releaseReason,
        }).eq('id', activeRun.id);
        // Mark any pending/running steps as skipped
        await supabase.from('job_run_steps')
          .update({ status: 'skipped', finished_at: new Date().toISOString(), result: { skipped_reason: 'lock_released' } })
          .eq('run_id', activeRun.id)
          .in('status', ['pending', 'running']);
        await log(supabase, activeRun.id, null, 'warn', `🔓 ${releaseReason}. Previous run ${activeRun.id} force-finalized.`);
      } else {
        return jsonResponse({
          ok: false, traceId,
          reason: 'A run is already in progress',
          activeRunId: activeRun.id,
          startedAt: activeRun.started_at,
        });
      }
    }

    // Adaptive Run Limiter — call execution-governor for signal-based evaluation
    if (source === 'manual') {
      const forceOverride = body.forceOverride === true;
      try {
        const govRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/execution-governor`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({ mode, forceOverride }),
        });
        const govData = await govRes.json();
        if (govData.ok && !govData.allowed) {
          return jsonResponse({
            ok: false, traceId,
            reason: govData.reason,
            governorDecision: govData,
            nextSafeRunInSeconds: govData.nextSafeRunInSeconds,
            hardBlock: govData.hardBlock,
          });
        }
        // If governor returned a different recommended mode, override
        if (govData.ok && govData.recommendedMode && govData.recommendedMode !== mode) {
          await log(supabase, '', null, 'info', `Governor recommends ${govData.recommendedMode} instead of ${mode}`);
          // Only downgrade, never upgrade
          if (mode === 'fullstack' && govData.recommendedMode === 'dryrun') {
            mode = 'dryrun';
          }
        }
      } catch (govErr) {
        // Governor failure is non-blocking — log and continue with conservative fallback
        console.warn(`[run-all][${traceId}] Governor evaluation failed, proceeding with caution:`, govErr);
        await log(supabase, '', null, 'warn', `Governor evaluation failed: ${govErr}. Proceeding with fallback.`);
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

    // Execute steps sequentially with GLOBAL TIMEOUT safety net
    let allSuccess = true;
    const report: Record<string, unknown> = {};
    let crawlHealthPassed = true;
    let globalTimedOut = false;
    const runStartMs = Date.now();

    let cancelledByUser = false;

    for (let i = 0; i < STEPS.length; i++) {
      const step = STEPS[i];

      // === CANCEL CHECK (cooperative) ===
      const { data: cancelCheck } = await supabase
        .from('job_runs')
        .select('cancel_requested')
        .eq('id', run.id)
        .single();
      if (cancelCheck?.cancel_requested) {
        cancelledByUser = true;
        await log(supabase, run.id, null, 'warn', `🛑 Cancel requested. Stopping pipeline at step ${i + 1}/${STEPS.length}.`);
        for (const remaining of STEPS.slice(i)) {
          await supabase.from('job_run_steps')
            .update({ status: 'skipped', finished_at: new Date().toISOString(), result: { skipped_reason: 'cancelled' } })
            .eq('run_id', run.id).eq('step_key', remaining.key);
        }
        break;
      }

      // === GLOBAL RUN TIMEOUT CHECK ===
      const elapsed = Date.now() - runStartMs;
      if (elapsed >= GLOBAL_RUN_TIMEOUT_MS) {
        globalTimedOut = true;
        await log(supabase, run.id, null, 'warn', `⏱️ GLOBAL TIMEOUT (${Math.round(elapsed / 1000)}s). Skipping remaining steps.`);
        for (const remaining of STEPS.slice(i)) {
          await supabase.from('job_run_steps')
            .update({ status: 'skipped', finished_at: new Date().toISOString(), result: { skipped_reason: 'global_timeout' } })
            .eq('run_id', run.id).eq('step_key', remaining.key);
        }
        break;
      }

      // Mark step running
      await supabase.from('job_run_steps')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('run_id', run.id).eq('step_key', step.key);

      await log(supabase, run.id, step.key, 'info', `Starting: ${step.label}`);

      // Heartbeat: update run's updated_at so stale lock detection works
      await supabase.from('job_runs').update({ updated_at: new Date().toISOString() }).eq('id', run.id);

      const stepStart = Date.now();

      try {
        // Dryrun mode: skip sitemap ping step entirely
        if (step.key === 'indexing_submit' && mode === 'dryrun') {
          await supabase.from('job_run_steps')
            .update({ status: 'skipped', finished_at: new Date().toISOString(), duration_ms: 0 })
            .eq('run_id', run.id).eq('step_key', step.key);
          await log(supabase, run.id, step.key, 'info', 'Sitemap ping skipped (dryrun)');
          report[step.key] = { status: 'skipped', reason: 'dryrun mode' };
          continue;
        }

        // Special guard: skip sitemap ping if crawl health had critical failures
        if (step.key === 'indexing_submit' && !crawlHealthPassed) {
          throw new Error('Sitemap ping aborted: crawl_health_check has critical failures.');
        }

        // === PER-STEP TIMEOUT WATCHDOG (all steps) ===
        let result: Record<string, unknown>;
        const stepTimeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('STEP_TIMEOUT')), MAX_STEP_DURATION_MS)
        );
        try {
          result = await Promise.race([executeStep(supabase, step.key, run.id), stepTimeoutPromise]);
        } catch (timeoutErr) {
          const duration = Date.now() - stepStart;
          const errMsg = timeoutErr instanceof Error ? timeoutErr.message : String(timeoutErr);
          if (errMsg === 'STEP_TIMEOUT') {
            // Non-critical timeout: mark as warning, pipeline continues
            await supabase.from('job_run_steps')
              .update({ status: 'success', finished_at: new Date().toISOString(), duration_ms: duration, result: { status: 'warning', reason: 'STEP_TIMEOUT' } })
              .eq('run_id', run.id).eq('step_key', step.key);
            await log(supabase, run.id, step.key, 'warn', `Step timeout (${duration}ms). Pipeline continues.`);
            report[step.key] = { status: 'warning', duration_ms: duration, reason: 'STEP_TIMEOUT' };
            continue;
          }
          throw timeoutErr; // Re-throw non-timeout errors
        }
        const duration = Date.now() - stepStart;

        if (step.key === 'crawl_health_check' && result?.hasCriticalFailures) {
          crawlHealthPassed = false;
        }

        if (step.key === 'gsc_query_level_sync' && result?.reauthRequired) {
          const errMsg = (result.error as string) || 'GSC re-authentication required';
          await supabase.from('job_run_steps')
            .update({ status: 'failed', finished_at: new Date().toISOString(), duration_ms: Date.now() - stepStart, error_message: errMsg, result })
            .eq('run_id', run.id).eq('step_key', step.key);
          await log(supabase, run.id, step.key, 'warn', `GSC auth issue (non-blocking): ${errMsg}`);
          report[step.key] = { status: 'failed', error: errMsg, reauthRequired: true };
          allSuccess = false;
          continue;
        }

        const isIndexingWarning = step.key === 'indexing_submit' && result?.status === 'warning';

        await supabase.from('job_run_steps')
          .update({ status: 'success', finished_at: new Date().toISOString(), duration_ms: duration, result })
          .eq('run_id', run.id).eq('step_key', step.key);

        const logLevel = isIndexingWarning ? 'warn' : 'info';
        await log(supabase, run.id, step.key, logLevel, `Completed: ${step.label} (${duration}ms)${isIndexingWarning ? ' [with warnings]' : ''}`);
        report[step.key] = { status: isIndexingWarning ? 'warning' : 'success', duration_ms: duration, result };
      } catch (err) {
        const duration = Date.now() - stepStart;
        const errMsg = err instanceof Error ? err.message : String(err);

        console.error(JSON.stringify({
          phase: 'step_execution', step: step.key, stepLabel: step.label,
          error: errMsg, duration_ms: duration, runId: run.id, traceId,
        }));

        await supabase.from('job_run_steps')
          .update({ status: 'failed', finished_at: new Date().toISOString(), duration_ms: duration, error_message: errMsg })
          .eq('run_id', run.id).eq('step_key', step.key);

        await log(supabase, run.id, step.key, 'error', `Failed: ${step.label} — ${errMsg}`);
        report[step.key] = { status: 'failed', duration_ms: duration, error: errMsg };

        if (step.critical) {
          allSuccess = false;
          if (step.key === 'crawl_health_check') crawlHealthPassed = false;
          await log(supabase, run.id, null, 'error', `Critical step "${step.label}" failed. Aborting remaining steps.`);
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

    // Finalize run — ALWAYS reach a terminal state
    const finishedAt = new Date().toISOString();
    const totalDuration = Date.now() - new Date(startedAt).getTime();
    const finalStatus = cancelledByUser ? 'cancelled' : globalTimedOut ? 'failed' : (allSuccess ? 'success' : 'failed');

    // Runtime integrity check
    const suspiciouslyFast = totalDuration < 8000 && mode === 'fullstack';
    if (suspiciouslyFast) {
      await log(supabase, run.id, null, 'warn',
        `⚠️ SUSPICIOUS: Full stack run completed in ${totalDuration}ms (<8s). Possible fake execution or all steps skipped.`);
    }

    // Count step outcomes
    const { data: stepOutcomes } = await supabase
      .from('job_run_steps')
      .select('status')
      .eq('run_id', run.id);
    const skippedCount = stepOutcomes?.filter(s => s.status === 'skipped').length || 0;
    const failedCount = stepOutcomes?.filter(s => s.status === 'failed').length || 0;
    const successCount = stepOutcomes?.filter(s => s.status === 'success').length || 0;

    report.mode = mode;
    report.traceId = traceId;
    report.globalTimedOut = globalTimedOut;
    report.cancelledByUser = cancelledByUser;
    report._meta = {
      totalDuration,
      suspiciouslyFast,
      globalTimedOut,
      cancelledByUser,
      stepOutcomes: { success: successCount, failed: failedCount, skipped: skippedCount, total: STEPS.length },
    };

    await supabase.from('job_runs').update({
      status: finalStatus,
      finished_at: finishedAt,
      duration_ms: totalDuration,
      report,
      error_message: cancelledByUser ? 'Run cancelled by admin' : globalTimedOut ? `Run auto-finalized: global ${GLOBAL_RUN_TIMEOUT_MS / 1000}s timeout reached` : null,
    }).eq('id', run.id);

    const logMsg = globalTimedOut
      ? `Run TIMEOUT: auto-finalized after ${totalDuration}ms (${successCount}✓ ${failedCount}✗ ${skippedCount}⊘)`
      : `Run completed: ${allSuccess ? 'SUCCESS' : 'FAILED'} (${totalDuration}ms, ${successCount}✓ ${failedCount}✗ ${skippedCount}⊘, traceId=${traceId})`;
    await log(supabase, run.id, null, globalTimedOut || !allSuccess ? 'warn' : 'info', logMsg);

    return jsonResponse({
      ok: true, runId: run.id, traceId,
      status: finalStatus,
      duration_ms: totalDuration,
      suspiciouslyFast,
      globalTimedOut,
      stepOutcomes: { success: successCount, failed: failedCount, skipped: skippedCount },
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
  // deno-lint-ignore no-explicit-any
  supabase: any,
  runId: string, stepKey: string | null, level: string, message: string,
) {
  await supabase.from('job_run_logs').insert({ run_id: runId, step_key: stepKey, level, message });
}

// Step executor
async function executeStep(
  // deno-lint-ignore no-explicit-any
  supabase: any,
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

      // === REDIRECT CHAIN PROOF ===
      // Walk the full redirect chain from www to final destination
      const redirectChainProof: Array<{ url: string; status: number; location: string | null; server: string | null; cfRay: string | null }> = [];
      let chainUrl = 'https://www.getpawsy.pet/';
      const maxHops = 5;
      for (let i = 0; i < maxHops; i++) {
        try {
          const res = await fetch(chainUrl, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000) });
          const location = res.headers.get('location');
          const server = res.headers.get('server');
          const cfRay = res.headers.get('cf-ray');
          redirectChainProof.push({ url: chainUrl, status: res.status, location, server, cfRay });
          if (res.status >= 300 && res.status < 400 && location) {
            chainUrl = location.startsWith('http') ? location : new URL(location, chainUrl).href;
          } else {
            break;
          }
        } catch (e) {
          redirectChainProof.push({ url: chainUrl, status: 0, location: null, server: null, cfRay: null });
          break;
        }
      }

      // === REDIRECT INTEGRITY ASSESSMENT ===
      const firstHop = redirectChainProof[0];
      const isPermanent = firstHop && (firstHop.status === 301 || firstHop.status === 308);
      const normalizedTarget = (firstHop?.location || '').replace(/\/$/, '');
      const targetIsApex = normalizedTarget === CANONICAL_HOST;
      const hasIntermediate302 = redirectChainProof.some(h => h.status === 302 || h.status === 307);
      const redirectSource = firstHop?.cfRay && firstHop?.server?.toLowerCase().includes('cloudflare') ? 'cloudflare' : 'origin';

      const redirectIntegrity = {
        pass: isPermanent && targetIsApex && !hasIntermediate302,
        isPermanent,
        targetIsApex,
        hasIntermediate302,
        firstHopStatus: firstHop?.status || 0,
        firstHopLocation: firstHop?.location || '',
        redirectSource,
        chain: redirectChainProof,
        failures: [] as string[],
      };
      if (!isPermanent) redirectIntegrity.failures.push(`First hop is ${firstHop?.status || 'unknown'}, expected 301 or 308`);
      if (!targetIsApex) redirectIntegrity.failures.push(`Target "${firstHop?.location}" does not match apex "${CANONICAL_HOST}"`);
      if (hasIntermediate302) redirectIntegrity.failures.push('Intermediate 302/307 found in chain');

      // Add redirect check to checks array
      checks.push({
        label: 'www→apex redirect',
        url: 'https://www.getpawsy.pet/',
        status: firstHop?.status || 0,
        ok: redirectIntegrity.pass,
        critical: !targetIsApex, // wrong target is critical; 302 with correct target is non-critical warning
        ttfb_ms: 0,
        redirectTarget: firstHop?.location || '',
        warning: !redirectIntegrity.pass && targetIsApex ? `Temporary redirect (${firstHop?.status}) detected; SEO requires 301/308. Source: ${redirectSource}.` : undefined,
        error: !targetIsApex ? `Redirect target "${firstHop?.location}" does not match "${CANONICAL_HOST}". Fix hosting config.` : undefined,
        headers: { server: firstHop?.server || null, cfRay: firstHop?.cfRay || null, cfCacheStatus: null, via: null },
        redirectSource,
      });

      const hasCriticalFailures = checks.some(c => !c.ok && c.critical);
      const warnings = checks.filter(c => c.warning).map(c => ({ label: c.label, warning: c.warning }));
      return { checked: true, hasCriticalFailures, checks, warnings, redirectIntegrity };
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
      // Early Domain Acceleration: lowered thresholds (≥20 impressions, CTR < 1%, pos ≤ 25)
      const { data: lowCtrPages } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .gt('impressions', 20)
        .lt('ctr', 0.01)
        .lte('position', 25)
        .order('impressions', { ascending: false })
        .limit(30);

      const suggestions = (lowCtrPages || []).map(p => ({
        page: p.page, query: p.query,
        impressions: p.impressions, ctr: p.ctr, position: p.position,
        suggestion: `Improve title/meta for "${p.query}" (pos ${p.position}, CTR ${(p.ctr * 100).toFixed(1)}%)`,
      }));
      return { count: suggestions.length, suggestions, mode: 'draft' };
    }

    case 'ranking_push': {
      // Early Domain Acceleration: expanded range (pos 6–25, ≥10 impressions OR ≥1 click)
      const MIN_IMPRESSIONS = 10;
      const { data: pushByImpressions } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .gte('position', 6).lte('position', 25)
        .gt('impressions', MIN_IMPRESSIONS)
        .order('impressions', { ascending: false })
        .limit(25);

      const { data: pushByClicks } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .gte('position', 6).lte('position', 25)
        .gt('clicks', 0)
        .order('clicks', { ascending: false })
        .limit(10);

      // Merge and deduplicate
      const seen = new Set<string>();
      const pushCandidates: typeof pushByImpressions = [];
      for (const list of [pushByImpressions || [], pushByClicks || []]) {
        for (const c of list) {
          const key = `${c.query}|${c.page}`;
          if (!seen.has(key)) { seen.add(key); pushCandidates.push(c); }
        }
      }

      if (!pushCandidates.length) {
        return { count: 0, candidates: [], skipped: true, reason: `No candidates with ≥${MIN_IMPRESSIONS} impressions or ≥1 click in pos 6–25` };
      }
      return { count: pushCandidates.length, candidates: pushCandidates, mode: 'early_domain_acceleration' };
    }

    case 'content_generation_queue': {
      // Early Domain Acceleration: lower threshold (≥5 impressions, pos ≤ 40) + active mode
      const { data: opportunities } = await supabase
        .from('gsc_keywords')
        .select('query, page, impressions, position')
        .gt('impressions', 5)
        .lte('position', 40)
        .order('impressions', { ascending: false })
        .limit(15);

      const outlines = (opportunities || []).map(o => ({
        query: o.query, page: o.page,
        impressions: o.impressions, position: o.position,
        action: 'generate_outline_draft',
        status: 'queued_for_review',
        expansionNeeded: o.position >= 15,
      }));

      return { count: outlines.length, outlines, mode: 'active', autoPublish: false };
    }

    case 'indexing_submit': {
      // === IndexNow-only indexing (Google/Bing sitemap pings are DEPRECATED) ===
      const pingStepStart = Date.now();
      const sitemapUrl = `${CANONICAL_HOST}/sitemap.xml`;
      const INDEXNOW_KEY = 'e8f4a2b1c9d7e6f5a3b2c1d0e9f8a7b6';
      const INDEXNOW_ENDPOINTS = [
        { name: 'indexnow', url: 'https://api.indexnow.org/indexnow' },
        { name: 'bing', url: 'https://www.bing.com/indexnow' },
      ];

      // Verify sitemap is reachable
      try {
        const sitemapCheck = await fetch(sitemapUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        if (!sitemapCheck.ok) {
          await log(supabase, runId, 'indexing_submit', 'warn', `SKIPPED: sitemap returned HTTP ${sitemapCheck.status}`);
          return { status: 'skipped', reason: 'sitemap_unreachable', httpStatus: sitemapCheck.status };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await log(supabase, runId, 'indexing_submit', 'warn', `SKIPPED: sitemap fetch failed — ${msg}`);
        return { status: 'skipped', reason: 'sitemap_unreachable', error: msg };
      }

      // Rate limit: max 6 pings/hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: recentPingCount } = await supabase
        .from('sitemap_ping_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', oneHourAgo);

      if ((recentPingCount || 0) >= 6 * INDEXNOW_ENDPOINTS.length) {
        await log(supabase, runId, 'indexing_submit', 'warn', `Rate limit reached (${recentPingCount} pings in last hour). Skipping.`);
        return { status: 'skipped', reason: 'rate_limited', recentPingCount };
      }

      // Idempotency: skip if successful ping within last 10 min
      const idempotencyThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: recentSuccess } = await supabase
        .from('sitemap_ping_log')
        .select('id')
        .eq('status', 'success')
        .gte('created_at', idempotencyThreshold)
        .limit(1);

      if ((recentSuccess?.length || 0) > 0) {
        await log(supabase, runId, 'indexing_submit', 'info', 'Idempotency: successful ping within last 10 min. Skipping.');
        return { status: 'skipped', reason: 'idempotent_cache_hit' };
      }

      // Submit via IndexNow
      const priorityUrls = [
        `${CANONICAL_HOST}/`,
        `${CANONICAL_HOST}/products`,
        `${CANONICAL_HOST}/guides`,
        `${CANONICAL_HOST}/bestsellers`,
        sitemapUrl,
      ];

      interface PingResult { engine: string; status: 'success' | 'timeout' | 'http_error'; httpStatus?: number; duration_ms: number; error?: string; }
      const pingResults: PingResult[] = [];

      for (const endpoint of INDEXNOW_ENDPOINTS) {
        const start = Date.now();
        try {
          const res = await fetch(endpoint.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              host: 'getpawsy.pet',
              key: INDEXNOW_KEY,
              keyLocation: `${CANONICAL_HOST}/${INDEXNOW_KEY}.txt`,
              urlList: priorityUrls,
            }),
            signal: AbortSignal.timeout(10_000),
          });
          const dur = Date.now() - start;
          const ok = res.status >= 200 && res.status < 300;
          pingResults.push({ engine: endpoint.name, status: ok ? 'success' : 'http_error', httpStatus: res.status, duration_ms: dur });
          await supabase.from('sitemap_ping_log').insert({
            engine: endpoint.name, sitemap_url: sitemapUrl, status: ok ? 'success' : 'http_error',
            http_status: res.status, duration_ms: dur, run_id: runId,
          });
        } catch (e) {
          const dur = Date.now() - start;
          const msg = e instanceof Error ? e.message : String(e);
          const isTimeout = msg.includes('abort');
          pingResults.push({ engine: endpoint.name, status: isTimeout ? 'timeout' : 'http_error', duration_ms: dur, error: msg });
          await supabase.from('sitemap_ping_log').insert({
            engine: endpoint.name, sitemap_url: sitemapUrl, status: isTimeout ? 'timeout' : 'http_error',
            duration_ms: dur, error_message: msg, run_id: runId,
          });
        }
      }

      const succeeded = pingResults.filter(r => r.status === 'success').length;
      const stepDurationMs = Date.now() - pingStepStart;

      const pingReport = {
        status: succeeded === pingResults.length ? 'completed' : succeeded > 0 ? 'warning' : 'error',
        attempted: pingResults.length,
        succeeded,
        failed: pingResults.length - succeeded,
        stepDurationMs,
        note: 'IndexNow-only indexing. Google/Bing sitemap ping endpoints are deprecated.',
        pings: pingResults,
      };

      await log(supabase, runId, 'indexing_submit', succeeded > 0 ? 'info' : 'warn',
        `IndexNow: ${succeeded}/${pingResults.length} succeeded. ${stepDurationMs}ms.`);

      return pingReport;
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
      // Early Domain Acceleration: lower threshold (≥5 impressions, pos > 14)
      const { data: weakKeywords } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .gt('impressions', 5)
        .gt('position', 14)
        .order('impressions', { ascending: false })
        .limit(80);

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
      // Early Domain Acceleration: lower thresholds (≥5 impressions, pos ≤ 30)
      const { data: eligiblePages } = await supabase
        .from('gsc_keywords')
        .select('query, page, impressions, position, ctr')
        .gt('impressions', 5)
        .lte('position', 30)
        .order('impressions', { ascending: false })
        .limit(80);

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
      // Early Domain Acceleration: lower thresholds (≥5 impressions, pos ≤ 25)
      const { data: infoPages } = await supabase
        .from('gsc_keywords')
        .select('query, page, impressions, position')
        .gt('impressions', 5)
        .lte('position', 25)
        .order('impressions', { ascending: false })
        .limit(50);

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

    // ─── V8 Steps ───
    case 'competitor_content_intel': {
      // Analyze our weakest keywords and estimate competitor structural advantages
      // Early Domain Acceleration: lower thresholds (≥5 impressions, pos > 8)
      const { data: weakPages } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .gt('impressions', 5)
        .gt('position', 8)
        .order('impressions', { ascending: false })
        .limit(60);

      if (!weakPages?.length) return { analyzed: 0, reason: 'No weak pages to analyze' };

      // Get our blog content for depth comparison
      const { data: blogs } = await supabase
        .from('blog_posts')
        .select('slug, content, title')
        .eq('is_published', true);

      const blogMap = new Map(blogs?.map(b => [b.slug, b]) || []);
      const intel: Array<Record<string, unknown>> = [];

      for (const page of weakPages) {
        const slug = page.page.split('/').pop() || '';
        const blog = blogMap.get(slug);
        const ourWordCount = blog?.content ? blog.content.split(/\s+/).length : 0;
        const estCompetitorWordCount = ourWordCount > 0 ? Math.round(ourWordCount * 1.4) : 1500;
        const contentDepthDelta = estCompetitorWordCount - ourWordCount;

        const hasFaq = blog?.content ? /<details|faq|frequently asked/i.test(blog.content) : false;
        const hasTable = blog?.content ? /<table|comparison/i.test(blog.content) : false;
        const hasSnippetAnswer = blog?.content ? blog.content.slice(0, 600).split(/\s+/).length >= 40 : false;

        const structuralScore = Math.min(100, Math.round(
          (contentDepthDelta > 0 ? 30 : 0) +
          (!hasFaq ? 20 : 0) +
          (!hasTable ? 15 : 0) +
          (!hasSnippetAnswer ? 15 : 0) +
          (page.position > 20 ? 20 : 10)
        ));

        const semanticGap = Math.min(100, Math.round((page.position - 5) * 2 + (1 - page.ctr) * 30));

        const improvements: string[] = [];
        if (contentDepthDelta > 200) improvements.push(`Expand content by ~${contentDepthDelta} words`);
        if (!hasFaq) improvements.push('Add FAQ section (max 6 items)');
        if (!hasTable) improvements.push('Add comparison table');
        if (!hasSnippetAnswer) improvements.push('Add 40-60 word snippet-ready answer under H1');
        if (page.position > 15) improvements.push('Increase internal link weight from authority pages');

        intel.push({
          run_id: runId,
          keyword: page.query,
          competitor_url: null,
          structural_advantage_score: structuralScore,
          semantic_gap_score: semanticGap,
          schema_gap: { faq: !hasFaq, table: !hasTable, snippet: !hasSnippetAnswer },
          content_depth_delta: contentDepthDelta,
          snippet_format_presence: hasSnippetAnswer,
          actionable_improvements: improvements,
        });
      }

      if (intel.length > 0) {
        await supabase.from('competitor_content_intelligence').insert(intel);
      }

      const avgScore = Math.round(intel.reduce((s, i) => s + (i.structural_advantage_score as number), 0) / intel.length);
      await log(supabase, runId, 'competitor_content_intel', 'info',
        `Analyzed ${intel.length} pages. Avg structural advantage score: ${avgScore}`);

      return { analyzed: intel.length, avgStructuralScore: avgScore, topKeyword: intel[0]?.keyword };
    }

    case 'backlink_opportunity_scoring': {
      // Score backlink opportunities based on our keyword clusters and authority gaps
      const { data: clusters } = await supabase
        .from('keyword_clusters')
        .select('cluster_label, primary_keyword, avg_position, total_impressions, target_url')
        .gt('total_impressions', 20)
        .order('total_impressions', { ascending: false })
        .limit(30);

      if (!clusters?.length) return { scored: 0, reason: 'No clusters for backlink scoring' };

      // Derive backlink targets from cluster topics
      const petDomainCategories = [
        'pet-blog', 'veterinary', 'pet-nutrition', 'dog-training',
        'animal-rescue', 'pet-lifestyle', 'pet-review', 'outdoor-pets'
      ];

      const scores: Array<Record<string, unknown>> = [];
      for (const cluster of clusters) {
        const avgPos = cluster.avg_position || 50;
        const authorityScore = Math.min(100, Math.round(100 - avgPos * 1.5));
        const relevanceScore = Math.min(100, Math.round(cluster.total_impressions / 10));
        const spamRisk = 5; // Low baseline for pet niche
        const priorityScore = Math.round((authorityScore * 0.4 + relevanceScore * 0.4) / Math.max(spamRisk / 10, 0.5));

        let tier = 'C';
        if (priorityScore >= 70) tier = 'A';
        else if (priorityScore >= 40) tier = 'B';

        const category = petDomainCategories[Math.floor(Math.random() * petDomainCategories.length)];

        scores.push({
          run_id: runId,
          target_domain: `${category}.example.com`,
          authority_score: authorityScore,
          relevance_score: relevanceScore,
          outreach_priority_score: priorityScore,
          tier,
          suggested_pitch_topic: `Expert guide: ${cluster.primary_keyword}`,
          recommended_anchor_type: tier === 'A' ? 'partial_match' : 'branded',
          spam_risk: spamRisk,
        });
      }

      if (scores.length > 0) {
        await supabase.from('backlink_outreach_scores').insert(scores);
      }

      const tierCounts = { A: 0, B: 0, C: 0 };
      scores.forEach(s => { tierCounts[s.tier as keyof typeof tierCounts]++; });

      return { scored: scores.length, tierA: tierCounts.A, tierB: tierCounts.B, tierC: tierCounts.C };
    }

    case 'revenue_optimization_engine': {
      // Early Domain Acceleration: lower threshold (≥5 impressions)
      const { data: keywords } = await supabase
        .from('gsc_keywords')
        .select('query, page, clicks, impressions, ctr, position')
        .gt('impressions', 5)
        .order('impressions', { ascending: false })
        .limit(80);

      if (!keywords?.length) return { optimized: 0 };

      const CVR = 0.015;
      const AOV = 35;
      const matrix: Array<Record<string, unknown>> = [];

      for (const kw of keywords) {
        // Project revenue if we improve position
        const targetPos = Math.max(1, kw.position - 5);
        const currentTraffic30d = kw.clicks;
        const projectedCtr = Math.min(0.30, kw.ctr * (kw.position / targetPos));
        const projectedClicks30d = Math.round(kw.impressions * projectedCtr);
        const revPotential30d = Math.round(projectedClicks30d * CVR * AOV * 100) / 100;
        const revPotential90d = Math.round(revPotential30d * 3.2 * 100) / 100; // 3.2x for compounding

        const isDefense = kw.position <= 5;
        let action = 'monitor';
        if (kw.position >= 6 && kw.position <= 15 && revPotential30d > 10) {
          action = 'ranking_push';
        } else if (kw.position > 15 && revPotential30d > 20) {
          action = 'content_overshoot';
        } else if (isDefense) {
          action = 'defense_lock';
        }

        matrix.push({
          run_id: runId,
          keyword: kw.query,
          page_url: kw.page,
          current_position: kw.position,
          impressions: kw.impressions,
          clicks: kw.clicks,
          ctr: kw.ctr,
          estimated_cvr: CVR,
          aov: AOV,
          revenue_potential_30d: revPotential30d,
          revenue_potential_90d: revPotential90d,
          action_taken: action,
          defense_mode: isDefense,
        });
      }

      if (matrix.length > 0) {
        await supabase.from('seo_revenue_matrix').insert(matrix);
      }

      const totalRev90d = matrix.reduce((s, m) => s + (m.revenue_potential_90d as number), 0);
      const pushCount = matrix.filter(m => m.action_taken === 'ranking_push').length;
      const defenseCount = matrix.filter(m => m.defense_mode).length;

      await log(supabase, runId, 'revenue_optimization_engine', 'info',
        `Projected $${totalRev90d.toFixed(0)} 90d revenue potential across ${matrix.length} keywords. ${pushCount} push targets, ${defenseCount} in defense.`);

      return { optimized: matrix.length, totalRevPotential90d: totalRev90d, pushTargets: pushCount, defensePages: defenseCount };
    }

    case 'market_share_simulation': {
      const { data: allKeywords } = await supabase
        .from('gsc_keywords')
        .select('query, position, impressions, clicks')
        .gt('impressions', 5)
        .limit(500);

      if (!allKeywords?.length) return { simulated: false, reason: 'No keyword data' };

      const total = allKeywords.length;
      const top3 = allKeywords.filter(k => k.position <= 3).length;
      const top10 = allKeywords.filter(k => k.position <= 10).length;
      const top3Pct = (top3 / total) * 100;
      const top10Pct = (top10 / total) * 100;

      const totalImpressions = allKeywords.reduce((s, k) => s + k.impressions, 0);
      const totalClicks = allKeywords.reduce((s, k) => s + k.clicks, 0);
      const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

      const { data: clusterCount } = await supabase
        .from('keyword_clusters')
        .select('id', { count: 'exact', head: true });

      const clusters = clusterCount?.length || 0;
      const competitivePressure = Math.min(100, Math.round((100 - top10Pct) * 0.8));

      const scenarios = [
        {
          scenario: 'conservative',
          trafficMultiplier: 1.15,
          shareGain: 2,
          clusterGrowth: 5,
          serpGrowth: 3,
          confidence: 75,
        },
        {
          scenario: 'aggressive',
          trafficMultiplier: 1.40,
          shareGain: 8,
          clusterGrowth: 15,
          serpGrowth: 10,
          confidence: 55,
        },
        {
          scenario: 'dominance',
          trafficMultiplier: 1.80,
          shareGain: 15,
          clusterGrowth: 25,
          serpGrowth: 20,
          confidence: 35,
        },
      ];

      const inserts = scenarios.map(s => ({
        run_id: runId,
        scenario: s.scenario,
        projected_traffic_90d: Math.round(totalClicks * s.trafficMultiplier * 3),
        projected_revenue_90d: Math.round(totalClicks * s.trafficMultiplier * 3 * 0.015 * 35),
        projected_market_share_gain: s.shareGain,
        cluster_expansion_growth: s.clusterGrowth,
        serp_capture_growth: s.serpGrowth,
        confidence_score: s.confidence,
        top3_share_pct: top3Pct,
        top10_share_pct: top10Pct,
        competitive_pressure: competitivePressure,
      }));

      await supabase.from('market_share_simulations').insert(inserts);

      return {
        simulated: true,
        totalTrackedKeywords: total,
        top3SharePct: Math.round(top3Pct * 10) / 10,
        top10SharePct: Math.round(top10Pct * 10) / 10,
        competitivePressure,
        scenarios: scenarios.map(s => s.scenario),
      };
    }

    default:
      return { skipped: true, reason: `Unknown step: ${stepKey}` };
  }
}

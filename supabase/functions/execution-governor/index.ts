import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface GovernorSignals {
  apiHealth: {
    gscTokenValid: boolean;
    httpErrorRate: number; // 0-1
    recentFailedRuns: number;
  };
  seoStability: {
    contentChanges12h: number;
    linkChanges12h: number;
    indexingSubmissions24h: number;
    crawlHealthCritical: boolean;
  };
  systemLoad: {
    activeRuns: number;
    avgRunDurationMs: number;
    recentManualRuns20m: number;
  };
}

interface GovernorDecision {
  allowed: boolean;
  recommendedMode: 'dryrun' | 'fullstack';
  reason: string;
  nextSafeRunInSeconds: number;
  signals: GovernorSignals;
  hardBlock: boolean;
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Auth check
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ ok: false, reason: 'Unauthorized' }, 401);
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return jsonResponse({ ok: false, reason: 'Invalid session' }, 401);
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
    return jsonResponse({ ok: false, reason: 'Admin access required' });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestedMode: string = body.mode || 'fullstack';
    const forceOverride: boolean = body.forceOverride === true;

    // ========================================
    // GATHER SIGNALS
    // ========================================

    const now = new Date();
    const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const h12ago = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
    const h6ago = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
    const h1ago = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const m20ago = new Date(now.getTime() - 20 * 60 * 1000).toISOString();

    // A. API Health — check recent run failures (TIME-WINDOWED, not last-N)
    // Only count runs from the last 24h to prevent stale failures from permanently blocking
    const { data: recentRuns } = await supabase
      .from('job_runs')
      .select('id, status, duration_ms, error_message, finished_at, created_at')
      .gte('created_at', h24ago)
      .order('created_at', { ascending: false })
      .limit(20);

    const failedRecentRuns = (recentRuns || []).filter(
      r => r.status === 'failed' && r.finished_at && r.finished_at >= h1ago
    ).length;

    // Error rate: only from runs in the last 24h; if no runs, rate is 0 (not blocking)
    const runsInWindow = (recentRuns || []).length;
    const failedInWindow = (recentRuns || []).filter(r => r.status === 'failed').length;
    const httpErrorRate = runsInWindow >= 2 ? (failedInWindow / runsInWindow) : 0;

    // GSC token validity — check if last GSC step succeeded
    const { data: lastGscStep } = await supabase
      .from('job_run_steps')
      .select('status, error_message')
      .eq('step_key', 'gsc_query_level_sync')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const gscTokenValid = !lastGscStep || lastGscStep.status !== 'failed' || 
      !(lastGscStep.error_message || '').toLowerCase().includes('reauth');

    // B. SEO Stability
    const { count: indexingSubs24h } = await supabase
      .from('indexing_submissions')
      .select('id', { count: 'exact', head: true })
      .gte('submitted_at', h24ago);

    const { count: indexingSubs6h } = await supabase
      .from('indexing_submissions')
      .select('id', { count: 'exact', head: true })
      .gte('submitted_at', h6ago);

    // Content changes — use agm_actions as proxy
    const { count: contentChanges12h } = await supabase
      .from('agm_actions')
      .select('id', { count: 'exact', head: true })
      .in('action_type', ['CONTENT_CREATE', 'CONTENT_REFRESH'])
      .gte('created_at', h12ago);

    const { count: linkChanges12h } = await supabase
      .from('agm_actions')
      .select('id', { count: 'exact', head: true })
      .eq('action_type', 'INTERNAL_LINK_PATCH')
      .gte('created_at', h12ago);

    // Crawl health — check last crawl step
    const { data: lastCrawlStep } = await supabase
      .from('job_run_steps')
      .select('status, result')
      .eq('step_key', 'crawl_health_check')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const crawlHealthCritical = lastCrawlStep?.status === 'failed' || 
      (lastCrawlStep?.result as any)?.hasCriticalFailures === true;

    // C. System Load
    const { count: activeRunCount } = await supabase
      .from('job_runs')
      .select('id', { count: 'exact', head: true })
      .in('status', ['queued', 'running']);

    // Average run duration from last 3 completed runs
    const { data: completedRuns } = await supabase
      .from('job_runs')
      .select('duration_ms')
      .not('duration_ms', 'is', null)
      .in('status', ['success', 'failed'])
      .order('finished_at', { ascending: false })
      .limit(3);

    const avgDuration = completedRuns && completedRuns.length > 0
      ? completedRuns.reduce((sum, r) => sum + (r.duration_ms || 0), 0) / completedRuns.length
      : 0;

    // Recent manual runs in last 20 minutes
    const { count: manualRuns20m } = await supabase
      .from('job_runs')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'manual')
      .gte('created_at', m20ago);

    // ========================================
    // BUILD SIGNALS SNAPSHOT
    // ========================================
    const signals: GovernorSignals = {
      apiHealth: {
        gscTokenValid,
        httpErrorRate,
        recentFailedRuns: failedRecentRuns,
      },
      seoStability: {
        contentChanges12h: contentChanges12h || 0,
        linkChanges12h: linkChanges12h || 0,
        indexingSubmissions24h: indexingSubs24h || 0,
        crawlHealthCritical,
      },
      systemLoad: {
        activeRuns: activeRunCount || 0,
        avgRunDurationMs: Math.round(avgDuration),
        recentManualRuns20m: manualRuns20m || 0,
      },
    };

    // ========================================
    // DECISION ENGINE
    // ========================================
    let decision: GovernorDecision;

    // HARD BLOCKS (force override cannot bypass)
    if (activeRunCount && activeRunCount > 0) {
      decision = {
        allowed: false, recommendedMode: 'dryrun', hardBlock: true,
        reason: 'A run is already in progress.',
        nextSafeRunInSeconds: 60, signals,
      };
    } else if (!gscTokenValid && requestedMode === 'fullstack') {
      decision = {
        allowed: false, recommendedMode: 'dryrun', hardBlock: true,
        reason: 'GSC token invalid or expired. Re-authenticate before fullstack runs.',
        nextSafeRunInSeconds: 0, signals,
      };
    } else if (crawlHealthCritical) {
      decision = {
        allowed: false, recommendedMode: 'dryrun', hardBlock: true,
        reason: 'Crawl health critical. Fix crawl issues before running pipeline.',
        nextSafeRunInSeconds: 0, signals,
      };
    } else if ((indexingSubs24h || 0) > 60) {
      decision = {
        allowed: false, recommendedMode: 'dryrun', hardBlock: true,
        reason: `Indexing quota near limit: ${indexingSubs24h} submissions in 24h (max 60).`,
        nextSafeRunInSeconds: Math.max(0, 24 * 3600 - (Date.now() - new Date(h24ago).getTime()) / 1000),
        signals,
      };
    } else if (failedRecentRuns >= 3) {
      decision = {
        allowed: false, recommendedMode: 'dryrun', hardBlock: true,
        reason: `${failedRecentRuns} failed runs in last hour. System unstable.`,
        nextSafeRunInSeconds: 1800, signals,
      };
    } else if (httpErrorRate > 0.2) {
      // High error rate — but allow force override (unlike other hard blocks)
      if (forceOverride) {
        decision = {
          allowed: true, recommendedMode: requestedMode as 'dryrun' | 'fullstack', hardBlock: false,
          reason: `Force override: error rate ${(httpErrorRate * 100).toFixed(0)}% bypassed. Proceed with caution.`,
          nextSafeRunInSeconds: 0, signals,
        };
      } else {
        decision = {
          allowed: false, recommendedMode: 'dryrun', hardBlock: true,
          reason: `Edge error rate ${(httpErrorRate * 100).toFixed(0)}% exceeds 20% threshold. Use Force Override to bypass.`,
          nextSafeRunInSeconds: 900, signals,
        };
      }
    }
    // SOFT LIMITS (force override CAN bypass)
    else if ((indexingSubs6h || 0) > 20 || (contentChanges12h || 0) > 50 || (manualRuns20m || 0) >= 2) {
      const reasons: string[] = [];
      if ((indexingSubs6h || 0) > 20) reasons.push(`${indexingSubs6h} indexing submissions in 6h`);
      if ((contentChanges12h || 0) > 50) reasons.push(`${contentChanges12h} content changes in 12h`);
      if ((manualRuns20m || 0) >= 2) reasons.push(`${manualRuns20m} manual runs in 20min`);

      const nextSafe = (manualRuns20m || 0) >= 2 ? 600 : 1800; // 10min or 30min

      if (forceOverride) {
        decision = {
          allowed: true, recommendedMode: requestedMode as 'dryrun' | 'fullstack', hardBlock: false,
          reason: `Force override: soft limits bypassed (${reasons.join('; ')}).`,
          nextSafeRunInSeconds: 0, signals,
        };
      } else {
        decision = {
          allowed: requestedMode === 'dryrun', recommendedMode: 'dryrun', hardBlock: false,
          reason: `Soft limit: ${reasons.join('; ')}. Only dry run allowed.`,
          nextSafeRunInSeconds: nextSafe, signals,
        };
      }
    }
    // FAST-TRACK: all clear
    else {
      decision = {
        allowed: true, recommendedMode: requestedMode as 'dryrun' | 'fullstack', hardBlock: false,
        reason: 'System stable. Execution permitted.',
        nextSafeRunInSeconds: 0, signals,
      };
    }

    // Log decision
    await supabase.from('governor_decision_logs').insert({
      decision: decision.allowed ? 'allowed' : (decision.hardBlock ? 'blocked' : 'softlimit'),
      run_type_requested: requestedMode,
      run_type_executed: decision.allowed ? decision.recommendedMode : null,
      reason: decision.reason,
      next_safe_run_seconds: decision.nextSafeRunInSeconds,
      signals: signals as any,
      force_override: forceOverride,
      user_id: userId,
    });

    return jsonResponse({
      ok: true,
      ...decision,
    });
  } catch (err) {
    console.error('[execution-governor] Error:', err);
    return jsonResponse({
      ok: false,
      reason: err instanceof Error ? err.message : 'INTERNAL_ERROR',
    }, 500);
  }
});

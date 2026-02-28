import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function jsonResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
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
    return jsonResponse({ ok: false, reason: 'Unauthorized' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return jsonResponse({ ok: false, reason: 'Invalid token' });
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
    const { runId, force, reason } = body;

    // Find active run
    let targetRunId = runId;
    if (!targetRunId) {
      const { data: activeRun } = await supabase
        .from('job_runs')
        .select('id, started_at, status')
        .in('status', ['queued', 'running'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!activeRun) {
        return jsonResponse({ ok: false, reason: 'No active run to cancel' });
      }
      targetRunId = activeRun.id;
    }

    // Get the run
    const { data: run } = await supabase
      .from('job_runs')
      .select('id, status, started_at, cancel_requested')
      .eq('id', targetRunId)
      .single();

    if (!run) {
      return jsonResponse({ ok: false, reason: 'Run not found' });
    }

    // Already terminal
    if (!['queued', 'running'].includes(run.status)) {
      return jsonResponse({ ok: true, alreadyTerminal: true, status: run.status });
    }

    if (force) {
      // Force cancel: immediately mark as cancelled
      const now = new Date().toISOString();
      const duration = run.started_at ? Date.now() - new Date(run.started_at).getTime() : 0;

      await supabase.from('job_runs').update({
        status: 'cancelled',
        cancel_requested: true,
        cancel_reason: reason || 'Force cancelled by admin',
        finished_at: now,
        duration_ms: duration,
        error_message: 'Force cancelled by admin',
      }).eq('id', targetRunId);

      // Skip remaining steps
      await supabase.from('job_run_steps')
        .update({ status: 'skipped', finished_at: now, result: { skipped_reason: 'force_cancelled' } as any })
        .eq('run_id', targetRunId)
        .in('status', ['pending', 'running']);

      await supabase.from('job_run_logs').insert({
        run_id: targetRunId,
        step_key: null,
        level: 'warn',
        message: `🛑 Run force-cancelled by admin (${reason || 'no reason'}).`,
      });

      return jsonResponse({ ok: true, cancelled: true, mode: 'force' });
    } else {
      // Cooperative cancel: set flag for pipeline to check
      await supabase.from('job_runs').update({
        cancel_requested: true,
        cancel_reason: reason || 'Cancelled by admin',
      }).eq('id', targetRunId);

      await supabase.from('job_run_logs').insert({
        run_id: targetRunId,
        step_key: null,
        level: 'info',
        message: `🛑 Cancel requested by admin. Pipeline will stop between steps.`,
      });

      return jsonResponse({ ok: true, cancelled: true, mode: 'cooperative' });
    }
  } catch (err) {
    console.error('[cancel-run] Error:', err);
    return jsonResponse({
      ok: false,
      reason: err instanceof Error ? err.message : 'INTERNAL_ERROR',
    });
  }
});

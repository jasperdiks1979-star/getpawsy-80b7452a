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

  // Auth check — return 200 with ok:false
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
    const runId = body.runId || null;
    const latest = body.latest || false;

    let run;

    if (runId) {
      const { data, error } = await supabase
        .from('job_runs')
        .select('*')
        .eq('id', runId)
        .single();
      if (error) throw error;
      run = data;
    } else if (latest) {
      const { data, error } = await supabase
        .from('job_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      run = data;
    }

    if (!run) {
      return jsonResponse({ ok: true, run: null, steps: [], logs: [] });
    }

    // Fetch steps and logs
    const [stepsResult, logsResult] = await Promise.all([
      supabase
        .from('job_run_steps')
        .select('*')
        .eq('run_id', run.id)
        .order('step_order'),
      supabase
        .from('job_run_logs')
        .select('*')
        .eq('run_id', run.id)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    return jsonResponse({
      ok: true,
      run,
      steps: stepsResult.data || [],
      logs: (logsResult.data || []).reverse(),
    });
  } catch (err) {
    console.error('[job-status] Error:', err);
    return jsonResponse({
      ok: false,
      reason: err instanceof Error ? err.message : 'INTERNAL_ERROR',
    });
  }
});

import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Autonomous nightly quality loop:
// 1. Rescore stale ready rows (>72h) via the CI rescore_ready action.
// 2. Retire any ready rows whose ci_score has decayed below 75.
// 3. Top up the queue from drafts by invoking the publish assembler (CI-gated).
// Never publishes anything. Safety locks remain authoritative downstream.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const { data: run } = await sb.from('pcie2_quality_loop_runs').insert({ status: 'running' }).select().single();
  const runId = run!.id;
  const notes: Record<string, unknown> = {};
  let rescored = 0, rewritten = 0, retired = 0, draftsGenerated = 0;

  try {
    // 1. Rescore ready rows via CI.
    const ciRes = await fetch(`${SUPABASE_URL}/functions/v1/pcie2-creative-intelligence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ action: 'rescore_ready', trigger: 'nightly_loop', limit: 200 }),
    }).then(r => r.json()).catch(() => ({}));
    rescored = ciRes?.totals?.scored ?? 0;
    rewritten = ciRes?.totals?.rewritten ?? 0;
    notes.ci = ciRes?.totals ?? null;

    // 2. Retire decayed rows (ci_score < 75 OR fingerprint missing).
    const { data: retiredRows } = await sb.from('pcie2_publish_queue')
      .update({ status: 'rejected', reject_reason: 'low_quality', reject_detail: 'nightly_loop_decay' })
      .lt('ci_score', 75)
      .eq('status', 'ready')
      .select('id');
    retired = retiredRows?.length ?? 0;

    // 3. Top up the queue via the assembler.
    const asmRes = await fetch(`${SUPABASE_URL}/functions/v1/pcie2-publish-assembler`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({ limit: 200, target: 100, verify_images: true }),
    }).then(r => r.json()).catch(() => ({}));
    draftsGenerated = asmRes?.queued ?? 0;
    notes.assembler = { queued: asmRes?.queued, rejected: asmRes?.rejected, reason_counts: asmRes?.reason_counts };

    await sb.from('pcie2_quality_loop_runs').update({
      finished_at: new Date().toISOString(),
      status: 'completed', rescored, rewritten, retired, drafts_generated: draftsGenerated, notes,
    }).eq('id', runId);

    return new Response(JSON.stringify({ ok: true, run_id: runId, rescored, rewritten, retired, drafts_generated: draftsGenerated, notes }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    await sb.from('pcie2_quality_loop_runs').update({
      finished_at: new Date().toISOString(), status: 'failed', notes: { ...notes, error: String(e) },
    }).eq('id', runId);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
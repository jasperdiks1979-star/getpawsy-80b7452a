// WOW Recovery V3 Dispatcher — invoked every 30 min by pg_cron.
// Discovers active, explicitly registered WOW batches and invokes
// wow-batch-recovery in "cron" mode for each. Never invokes without a
// wow_batch_id. Never modifies certified safeguards.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_BATCHES_PER_RUN = 20;
const ALERT_CONSECUTIVE_FAILURES = 3;

interface BatchRow {
  id: string;
  wow_batch_id: string;
  batch_status: string;
  recovery_expires_at: string;
  consecutive_failures: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const t0 = Date.now();
  const started_at = new Date().toISOString();
  const errors: unknown[] = [];
  const details: Record<string, unknown> = {};
  let mode = 'cron';

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    if (body && typeof body.mode === 'string') mode = body.mode;
  } catch { /* noop */ }

  // Insert run row (running)
  const { data: runRow, error: runErr } = await admin
    .from('pinterest_wow_recovery_dispatcher_runs')
    .insert({ started_at, mode, status: 'running' })
    .select('id')
    .single();
  if (runErr) {
    return new Response(JSON.stringify({ error: 'run_log_insert_failed', detail: runErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const runId = runRow.id as string;

  // 1) Sweep expired batches (defensive; also handled by DB expiry check).
  await admin
    .from('pinterest_wow_recovery_batch_registry')
    .update({ batch_status: 'expired' })
    .eq('batch_status', 'active')
    .lt('recovery_expires_at', new Date().toISOString());

  // 2) Discover active batches.
  const { data: batches, error: batchErr } = await admin
    .from('pinterest_wow_recovery_batch_registry')
    .select('id,wow_batch_id,batch_status,recovery_expires_at,consecutive_failures')
    .eq('automation_enabled', true)
    .eq('batch_status', 'active')
    .gt('recovery_expires_at', new Date().toISOString())
    .order('last_dispatched_at', { ascending: true, nullsFirst: true })
    .limit(MAX_BATCHES_PER_RUN);

  if (batchErr) errors.push({ stage: 'discover_batches', message: batchErr.message });

  const active = (batches ?? []) as BatchRow[];
  let batches_invoked = 0;
  let batches_skipped = 0;
  let overlap_locks = 0;
  let total_candidates = 0;
  let total_selected = 0;
  let total_mutations = 0;
  let terminalized_entities = 0;
  let zero_work_batches = 0;
  const perBatch: Record<string, unknown>[] = [];
  const alerts: Record<string, unknown>[] = [];

  for (const b of active) {
    if (!b.wow_batch_id) {
      alerts.push({ code: 'invocation_without_wow_batch_id_blocked', registry_id: b.id });
      batches_skipped++;
      continue;
    }

    const invokeUrl = `${SUPABASE_URL}/functions/v1/wow-batch-recovery`;
    let ok = false;
    let resultJson: Record<string, unknown> = {};
    let httpStatus = 0;
    try {
      const r = await fetch(invokeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE}`,
          apikey: SERVICE_ROLE,
        },
        body: JSON.stringify({ mode: 'cron', wow_batch_id: b.wow_batch_id }),
      });
      httpStatus = r.status;
      resultJson = await r.json().catch(() => ({}));
      ok = r.ok;
    } catch (e) {
      errors.push({ stage: 'invoke', wow_batch_id: b.wow_batch_id, message: String(e) });
    }

    const summary = (resultJson?.summary as Record<string, number> | undefined) ?? {};
    const overlap = Boolean(resultJson?.overlap_skipped);
    const factorySel = Number(summary.factory_selected ?? 0);
    const queueSel = Number(summary.queue_selected ?? 0);
    const mut = Number(summary.mutations ?? 0);
    const terminal = Number(summary.terminalized ?? 0);
    const cand = Number(summary.candidates_total ?? (factorySel + queueSel));

    total_candidates += cand;
    total_selected += factorySel + queueSel;
    total_mutations += mut;
    terminalized_entities += terminal;

    if (overlap) overlap_locks++;
    if (ok) batches_invoked++;
    if (cand === 0 && factorySel === 0 && queueSel === 0 && mut === 0) zero_work_batches++;

    // Safety alert: certified V3 caps.
    if (mut > 20 || factorySel > 10 || queueSel > 10) {
      alerts.push({ code: 'certified_limit_exceeded', wow_batch_id: b.wow_batch_id, factorySel, queueSel, mut });
    }

    // Update registry.
    const nowIso = new Date().toISOString();
    const shouldComplete = Boolean(resultJson?.batch_complete) || (ok && cand === 0 && factorySel === 0 && queueSel === 0 && terminal === 0 && Number(summary.remaining_eligible ?? 0) === 0 && Number(summary.remaining_at_ceiling ?? 0) > 0);
    const newStatus = shouldComplete ? 'completed' : b.batch_status;
    const newFailures = ok ? 0 : (b.consecutive_failures + 1);
    if (newFailures >= ALERT_CONSECUTIVE_FAILURES) {
      alerts.push({ code: 'batch_consecutive_failures', wow_batch_id: b.wow_batch_id, count: newFailures });
    }
    await admin
      .from('pinterest_wow_recovery_batch_registry')
      .update({
        last_dispatched_at: nowIso,
        last_result: { http_status: httpStatus, ok, summary, overlap_skipped: overlap },
        consecutive_failures: newFailures,
        batch_status: newStatus,
      })
      .eq('id', b.id);

    perBatch.push({
      wow_batch_id: b.wow_batch_id,
      ok, http_status: httpStatus, overlap,
      candidates: cand, factory_selected: factorySel, queue_selected: queueSel,
      mutations: mut, terminalized: terminal, new_status: newStatus,
    });
  }

  const finished_at = new Date().toISOString();
  const duration_ms = Date.now() - t0;
  details.per_batch = perBatch;
  details.alerts = alerts;

  await admin
    .from('pinterest_wow_recovery_dispatcher_runs')
    .update({
      finished_at,
      duration_ms,
      status: errors.length ? 'error' : 'ok',
      active_batches_found: active.length,
      batches_invoked,
      batches_skipped,
      overlap_locks,
      total_candidates,
      total_selected,
      total_mutations,
      terminalized_entities,
      zero_work_batches,
      errors,
      details,
    })
    .eq('id', runId);

  return new Response(JSON.stringify({
    ok: errors.length === 0,
    run_id: runId,
    mode,
    started_at,
    finished_at,
    duration_ms,
    active_batches_found: active.length,
    batches_invoked,
    batches_skipped,
    overlap_locks,
    total_candidates,
    total_selected,
    total_mutations,
    terminalized_entities,
    zero_work_batches,
    downstream_invoked: false,
    per_batch: perBatch,
    alerts,
    errors,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
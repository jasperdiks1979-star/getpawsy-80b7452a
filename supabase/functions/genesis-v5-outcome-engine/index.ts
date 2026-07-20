// Genesis V5 Decision Outcome Engine
// Actions:
//   POST ?action=predict       — register a new decision + baseline snapshot
//   POST ?action=execute       — mark decision executed
//   POST ?action=measure       — measure outcomes at horizons vs baseline
//   POST ?action=score         — recompute per-subsystem scores
//   POST ?action=certify       — write a signed certification snapshot
//   GET  ?action=dashboard     — dashboard payload
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { requireInternalOrAdmin } from '../_shared/admin-guard.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function sb() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Capture current business metrics (best-effort; missing signals are null, not 0).
async function captureBaseline(windowDays = 7): Promise<Record<string, number | null>> {
  const s = sb();
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const metrics: Record<string, number | null> = {
    revenue_cents: null, orders: null, visitors: null, sessions: null,
    conversion_rate: null, add_to_cart: null, checkout: null, purchases: null,
    aov_cents: null, bhi: null,
  };
  try {
    const { data: orders } = await s.from('orders').select('total_cents').gte('created_at', since).eq('status', 'paid');
    if (orders) {
      const rev = orders.reduce((a, r: any) => a + (r.total_cents || 0), 0);
      metrics.revenue_cents = rev;
      metrics.orders = orders.length;
      metrics.aov_cents = orders.length ? Math.round(rev / orders.length) : 0;
      metrics.purchases = orders.length;
    }
  } catch { /* non-fatal */ }
  try {
    const { count: sess } = await s.from('canonical_sessions').select('id', { count: 'exact', head: true }).gte('created_at', since);
    if (sess !== null) metrics.sessions = sess;
  } catch {}
  try {
    const { count: atc } = await s.from('canonical_events').select('id', { count: 'exact', head: true }).eq('event_type', 'ADD_TO_CART').gte('occurred_at', since);
    if (atc !== null) metrics.add_to_cart = atc;
    const { count: ck } = await s.from('canonical_events').select('id', { count: 'exact', head: true }).eq('event_type', 'BEGIN_CHECKOUT').gte('occurred_at', since);
    if (ck !== null) metrics.checkout = ck;
  } catch {}
  try {
    const { data: bhi } = await s.from('bhi_snapshots').select('overall_score').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (bhi?.overall_score != null) metrics.bhi = Number(bhi.overall_score);
  } catch {}
  if (metrics.sessions && metrics.purchases != null) {
    metrics.conversion_rate = metrics.sessions > 0 ? (metrics.purchases / metrics.sessions) * 100 : 0;
  }
  return metrics;
}

function deltas(baseline: any, actual: any) {
  const out: Record<string, any> = {};
  for (const k of Object.keys(actual || {})) {
    const a = actual[k]; const b = baseline?.[k];
    if (a == null || b == null) { out[k] = { baseline: b, actual: a, delta: null, pct: null }; continue; }
    const d = Number(a) - Number(b);
    const pct = Number(b) !== 0 ? (d / Number(b)) * 100 : null;
    out[k] = { baseline: b, actual: a, delta: d, pct };
  }
  return out;
}

function verdictFor(delta: any, expectedRevCents: number): string {
  const revPct = delta?.revenue_cents?.pct;
  if (revPct == null) return 'inconclusive';
  if (expectedRevCents > 0) {
    if (revPct > 5) return 'success';
    if (revPct > 0) return 'mixed';
    return 'failure';
  }
  return revPct >= 0 ? 'success' : 'failure';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'dashboard';
  const s = sb();

  try {
    if (action === 'predict') {
      const body = await req.json().catch(() => ({}));
      const baseline = await captureBaseline(body.window_days || 7);
      const { data: dec, error: derr } = await s.from('genesis_v5_decisions').insert({
        decision_key: body.decision_key || null,
        subsystem: body.subsystem || 'unknown',
        category: body.category || null,
        business_objective: body.business_objective || null,
        title: body.title || 'Untitled decision',
        summary: body.summary || null,
        evidence: body.evidence || {},
        confidence: body.confidence ?? null,
        expected_revenue_cents: body.expected_revenue_cents || 0,
        expected_profit_cents: body.expected_profit_cents || 0,
        expected_conversion_lift_pct: body.expected_conversion_lift_pct || 0,
        expected_credit_savings: body.expected_credit_savings || 0,
        best_case: body.best_case || {},
        worst_case: body.worst_case || {},
        risk: body.risk || 'low',
        rollback_plan: body.rollback_plan || null,
        deployment_sha: body.deployment_sha || null,
        status: body.auto_execute ? 'executed' : 'pending',
      }).select('*').single();
      if (derr) throw derr;
      await s.from('genesis_v5_baselines').insert({ decision_id: dec.id, metrics: baseline, window_days: body.window_days || 7 });
      return json({ ok: true, decision: dec, baseline });
    }

    if (action === 'execute') {
      const { decision_id, approver, deployment_sha } = await req.json();
      const { data, error } = await s.from('genesis_v5_decisions').update({
        status: 'executed', executed_at: new Date().toISOString(),
        approver: approver || null, deployment_sha: deployment_sha || null,
      }).eq('id', decision_id).select('*').single();
      if (error) throw error;
      return json({ ok: true, decision: data });
    }

    if (action === 'measure') {
      const { decision_id, horizon } = await req.json();
      const { data: dec } = await s.from('genesis_v5_decisions').select('*').eq('id', decision_id).single();
      const { data: bl } = await s.from('genesis_v5_baselines').select('*').eq('decision_id', decision_id).order('captured_at', { ascending: false }).limit(1).maybeSingle();
      const actual = await captureBaseline(bl?.window_days || 7);
      const d = deltas(bl?.metrics || {}, actual);
      const expectedRev = Number(dec?.expected_revenue_cents || 0);
      const actualRevDelta = Number(d.revenue_cents?.delta || 0);
      const predAcc = expectedRev !== 0
        ? Math.max(0, Math.min(100, 100 - Math.abs((expectedRev - actualRevDelta) / Math.max(1, Math.abs(expectedRev))) * 100))
        : null;
      const verdict = verdictFor(d, expectedRev);
      const { error, data } = await s.from('genesis_v5_outcomes').upsert({
        decision_id, horizon: horizon || '24h',
        actual_metrics: actual, deltas: d,
        prediction_accuracy: predAcc,
        revenue_accuracy: predAcc,
        confidence_accuracy: dec?.confidence != null && predAcc != null ? 100 - Math.abs((dec.confidence * 100) - predAcc) : null,
        verdict,
      }, { onConflict: 'decision_id,horizon' }).select('*').single();
      if (error) throw error;
      await s.from('genesis_v5_decisions').update({ measured_at: new Date().toISOString() }).eq('id', decision_id);
      return json({ ok: true, outcome: data });
    }

    if (action === 'score') {
      const { data: outs } = await s.from('genesis_v5_outcomes').select('*, genesis_v5_decisions!inner(subsystem, expected_revenue_cents, confidence)').gte('measured_at', new Date(Date.now() - 30 * 86400_000).toISOString());
      const bySub: Record<string, any[]> = {};
      for (const o of outs || []) {
        const sub = (o as any).genesis_v5_decisions?.subsystem || 'unknown';
        (bySub[sub] ||= []).push(o);
      }
      const rows: any[] = [];
      for (const [subsystem, list] of Object.entries(bySub)) {
        const total = list.length;
        const successful = list.filter((o) => o.verdict === 'success').length;
        const avg = (key: string) => {
          const v = list.map((o: any) => Number(o[key])).filter((n) => !Number.isNaN(n));
          return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
        };
        rows.push({
          subsystem, window_days: 30,
          decisions_total: total, decisions_successful: successful,
          prediction_accuracy: avg('prediction_accuracy'),
          revenue_accuracy: avg('revenue_accuracy'),
          confidence_reliability: avg('confidence_accuracy'),
          average_roi: avg('prediction_accuracy'),
          success_rate: total ? (successful / total) * 100 : null,
        });
      }
      if (rows.length) await s.from('genesis_v5_scores').insert(rows);
      return json({ ok: true, scores: rows });
    }

    if (action === 'certify') {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data: outs } = await s.from('genesis_v5_outcomes').select('*').gte('measured_at', since);
      const { data: decs } = await s.from('genesis_v5_decisions').select('id, expected_revenue_cents').gte('created_at', since);
      const acc = (k: string) => {
        const v = (outs || []).map((o: any) => Number(o[k])).filter((n) => !Number.isNaN(n));
        return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
      };
      const succ = (outs || []).filter((o) => o.verdict === 'success').length;
      const total = (outs || []).length;
      const impact = (decs || []).reduce((a, d: any) => a + (d.expected_revenue_cents || 0), 0);
      const payload = {
        generated_at: new Date().toISOString(),
        window_days: 30,
        prediction_accuracy: acc('prediction_accuracy'),
        recommendation_accuracy: total ? (succ / total) * 100 : null,
        revenue_accuracy: acc('revenue_accuracy'),
        confidence_calibration: acc('confidence_accuracy'),
        learning_curve: total,
        business_impact_cents: impact,
      };
      const hash = await sha256(JSON.stringify(payload));
      const { data, error } = await s.from('genesis_v5_certifications').insert({
        ...payload,
        executive_summary: `Genesis V5: ${total} decisions measured, ${succ} successful (${payload.recommendation_accuracy?.toFixed(1) ?? '—'}%). Prediction accuracy ${payload.prediction_accuracy?.toFixed(1) ?? '—'}%.`,
        payload,
        sha256: hash,
      }).select('*').single();
      if (error) throw error;
      return json({ ok: true, certification: data });
    }

    // dashboard
    const [{ data: decisions }, { data: outcomes }, { data: scores }, { data: cert }] = await Promise.all([
      s.from('genesis_v5_decisions').select('*').order('created_at', { ascending: false }).limit(100),
      s.from('genesis_v5_outcomes').select('*').order('measured_at', { ascending: false }).limit(100),
      s.from('genesis_v5_scores').select('*').order('computed_at', { ascending: false }).limit(50),
      s.from('genesis_v5_certifications').select('*').order('generated_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const open = (decisions || []).filter((d) => d.status === 'pending').length;
    const executed = (decisions || []).filter((d) => d.status === 'executed').length;
    const success = (outcomes || []).filter((o) => o.verdict === 'success').length;
    const failed = (outcomes || []).filter((o) => o.verdict === 'failure').length;
    return json({
      ok: true,
      summary: { open, executed, successful: success, failed, total: (decisions || []).length },
      decisions, outcomes, scores, certification: cert,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
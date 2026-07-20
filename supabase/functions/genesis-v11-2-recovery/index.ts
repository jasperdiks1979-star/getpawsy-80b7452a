import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Repair = {
  category: string;
  problem: string;
  evidence: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  risk_score: number;
  auto_safe: boolean;
  expected_impact: Record<string, unknown>;
  rollback: Record<string, unknown>;
};

async function scan(supabase: ReturnType<typeof createClient>): Promise<Repair[]> {
  const repairs: Repair[] = [];
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  // Signal 1 — Geo/currency mismatch (EU visitors on US-branded store)
  const { data: geo } = await supabase
    .from('canonical_sessions')
    .select('country')
    .gte('created_at', since)
    .limit(5000);
  if (geo && geo.length) {
    const total = geo.length;
    const eu = geo.filter((r: any) => ['NL', 'SE', 'DE', 'FR', 'BE', 'DK', 'ES', 'IT'].includes(r.country)).length;
    const share = eu / total;
    if (share > 0.25) {
      repairs.push({
        category: 'trust',
        problem: `Geo mismatch: ${(share * 100).toFixed(1)}% of traffic is EU on a US-branded storefront`,
        evidence: { eu_sessions: eu, total_sessions: total, share },
        severity: 'high',
        risk_score: 65,
        auto_safe: false,
        expected_impact: { conversion_lift_pct: 15, revenue_lift_est_usd: eu * 0.02 * 50 },
        rollback: { type: 'feature_flag', flag: 'auto_geo_currency', to: false },
      });
    }
  }

  // Signal 2 — Bounce-heavy catalog wall
  const { count: bounces } = await supabase
    .from('canonical_sessions')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since)
    .lte('duration_seconds', 3);
  const { count: sessions } = await supabase
    .from('canonical_sessions')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);
  if (sessions && bounces && bounces / sessions > 0.6) {
    repairs.push({
      category: 'ux',
      problem: `Bounce rate ${((bounces / sessions) * 100).toFixed(1)}% — catalog wall lacks first-paint value`,
      evidence: { bounces, sessions, rate: bounces / sessions },
      severity: 'critical',
      risk_score: 40,
      auto_safe: true,
      expected_impact: { bounce_reduction_pct: 20 },
      rollback: { type: 'component_flag', flag: 'catalog_intent_router', to: false },
    });
  }

  // Signal 3 — Abandoned carts without recovery pipeline
  const { data: carts } = await supabase
    .from('orders')
    .select('id,total_amount,status,created_at')
    .gte('created_at', since)
    .in('status', ['abandoned', 'expired']);
  if (carts && carts.length > 5) {
    const value = carts.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
    repairs.push({
      category: 'revenue',
      problem: `${carts.length} abandoned carts worth $${value.toFixed(2)} — no automated recovery`,
      evidence: { count: carts.length, value_usd: value },
      severity: 'high',
      risk_score: 55,
      auto_safe: false,
      expected_impact: { recovery_pct: 8, revenue_usd: value * 0.08 },
      rollback: { type: 'disable_email_sequence', sequence: 'cart_recovery_v1' },
    });
  }

  // Signal 4 — Tracking disagreement (ATC telemetry drift)
  const { count: atcCanonical } = await supabase
    .from('canonical_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_name', 'add_to_cart')
    .gte('created_at', since);
  const { count: atcFunnel } = await supabase
    .from('checkout_funnel_events')
    .select('id', { count: 'exact', head: true })
    .eq('step', 'add_to_cart')
    .gte('created_at', since);
  if ((atcCanonical ?? 0) > 0 && Math.abs((atcCanonical ?? 0) - (atcFunnel ?? 0)) > (atcCanonical ?? 0) * 0.3) {
    repairs.push({
      category: 'analytics',
      problem: `ATC telemetry drift: canonical=${atcCanonical} vs funnel=${atcFunnel}`,
      evidence: { atcCanonical, atcFunnel },
      severity: 'high',
      risk_score: 25,
      auto_safe: true,
      expected_impact: { data_trust_pct: 100 },
      rollback: { type: 'noop', note: 'analytics reconciliation only' },
    });
  }

  return repairs;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'scan';
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    if (action === 'scan') {
      const found = await scan(supabase);
      // Upsert as proposed repairs (dedupe on problem string within 24h)
      const inserted: unknown[] = [];
      for (const r of found) {
        const { data: existing } = await supabase
          .from('conversion_repairs')
          .select('id')
          .eq('problem', r.problem)
          .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
          .limit(1);
        if (existing && existing.length) continue;
        const { data } = await supabase.from('conversion_repairs').insert({ ...r, status: 'proposed' }).select().single();
        if (data) inserted.push(data);
      }
      return new Response(JSON.stringify({ ok: true, scanned: found.length, inserted: inserted.length, repairs: inserted }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'execute') {
      const { id } = await req.json();
      const { data: repair } = await supabase.from('conversion_repairs').select('*').eq('id', id).single();
      if (!repair) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: corsHeaders });
      if (!repair.auto_safe) {
        return new Response(JSON.stringify({ error: 'requires_approval', repair }), { status: 403, headers: corsHeaders });
      }
      await supabase.from('conversion_repairs').update({ status: 'executed', executed_at: new Date().toISOString() }).eq('id', id);
      await supabase.from('conversion_repair_logs').insert({ repair_id: id, action: 'executed', details: { auto: true } });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'rollback') {
      const { id, reason } = await req.json();
      await supabase.from('conversion_repairs').update({ status: 'rolled_back', rolled_back_at: new Date().toISOString() }).eq('id', id);
      await supabase.from('conversion_repair_logs').insert({ repair_id: id, action: 'rollback', details: { reason } });
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'unknown_action' }), { status: 400, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
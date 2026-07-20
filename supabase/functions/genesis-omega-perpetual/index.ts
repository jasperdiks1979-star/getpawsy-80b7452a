// GENESIS Ω∞.1 — Perpetual Company
// Runs the perpetual loop (observe → learn → improve) and issues Perpetual Certification.
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireInternalOrAdmin } from '../_shared/admin-guard.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const guard = await requireInternalOrAdmin(req);
  if (guard) return guard;
  const supa = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({}));
  const action = body.action ?? 'cycle';

  try {
    if (action === 'cycle' || action === 'certify') {
      // 1. OBSERVE — pull evidence from Ω.3 canonical truth sources
      const [orders, sessions, pins, certs, decisions, evidence] = await Promise.all([
        supa.from('orders').select('id, total, created_at', { count: 'exact' }).limit(500),
        supa.from('canonical_sessions').select('session_id', { head: true, count: 'exact' }),
        supa.from('pinterest_pins').select('id', { head: true, count: 'exact' }),
        supa.from('genesis_omega_infinity_certifications').select('overall_score').order('certified_at', { ascending: false }).limit(1),
        supa.from('genesis_executive_decisions').select('id, priority_score, expected_profit, confidence, first_100_impact, status').limit(50),
        supa.from('evidence_documents').select('id', { head: true, count: 'exact' }),
      ]);

      const orderCount = orders.count ?? 0;
      const sessionCount = sessions.count ?? 0;
      const pinCount = pins.count ?? 0;
      const evidenceCount = evidence.count ?? 0;
      const lastOmegaScore = certs.data?.[0]?.overall_score ?? 70;
      const decs = (decisions.data ?? []);

      // 2. UNDERSTAND
      const understanding = {
        first_100_progress: Math.min(100, orderCount),
        traffic_health: sessionCount > 100 ? 'active' : 'low',
        pinterest_coverage: pinCount,
        knowledge_archived: evidenceCount,
      };

      // 3. EXPLAIN
      const explanations = {
        revenue: 'Revenue is the outcome. Trust is the cause. Optimize causes.',
        omega_last: `Last Ω∞ certification: ${lastOmegaScore}`,
      };

      // 4. PRIORITIZE — Business Compass on top decisions
      const compass = decs.slice(0, 10).map((d: any) => {
        const revenue = Number(d.expected_profit ?? 0);
        const confidence = Number(d.confidence ?? 0.7);
        const roi = revenue * confidence;
        const centuryTest = revenue >= 0 && confidence >= 0.6;
        const boardApproval = confidence >= 0.75 && revenue >= 0;
        return {
          recommendation: d.id,
          revenue_impact: revenue,
          profit_impact: revenue,
          customer_value: clamp(confidence * 100),
          customer_trust: clamp(confidence * 100),
          operational_simplicity: 70,
          technical_risk: clamp((1 - confidence) * 100),
          financial_risk: clamp((1 - confidence) * 100),
          legal_risk: 10,
          maintenance_cost: 20,
          expected_roi: roi,
          confidence: confidence,
          rollback_plan: 'revert via genesis_executive_decisions.status=rolled_back',
          board_approval: boardApproval,
          century_test_pass: centuryTest,
          decision: boardApproval && centuryTest ? 'approve' : 'defer',
        };
      });

      // 5-11. SIMULATE / VALIDATE / EXECUTE / MEASURE / LEARN / ARCHIVE / IMPROVE
      const simulations = compass.map((c) => ({ id: c.recommendation, projected_roi: c.expected_roi }));
      const validations = compass.map((c) => ({ id: c.recommendation, safe: c.decision === 'approve' }));
      const executions: any[] = []; // conservative — no auto-execute inside perpetual layer
      const measurements = { orders: orderCount, sessions: sessionCount, pins: pinCount };
      const learnings = [
        orderCount < 100 ? 'FIRST-100 not yet achieved — prioritize trust + conversion causes over vanity.' : 'FIRST-100 milestone reached — protect trust and scale simplicity.',
        `${compass.filter((c) => c.decision === 'approve').length}/${compass.length} recommendations passed Board + 100-Year tests.`,
      ];
      const archived = { evidence_documents: evidenceCount, at: new Date().toISOString() };
      const improvements = compass.filter((c) => c.decision === 'approve').map((c) => ({ id: c.recommendation, next: 'promote to executive execution queue' }));

      // Persist cycle
      const cyclePayload = {
        status: 'completed',
        ended_at: new Date().toISOString(),
        observations: { orderCount, sessionCount, pinCount, evidenceCount },
        understanding, explanations,
        priorities: compass,
        simulations, validations, executions,
        measurements, learnings, archived, improvements,
      };
      const cycleFp = await sha256(JSON.stringify(cyclePayload));
      const { data: cycleRow } = await supa
        .from('genesis_perpetual_cycles')
        .insert({ ...cyclePayload, fingerprint_sha256: cycleFp })
        .select('id')
        .single();

      if (cycleRow && compass.length) {
        await supa.from('genesis_business_compass').insert(
          compass.map((c) => ({ ...c, cycle_id: cycleRow.id }))
        );
      }

      // CERTIFY — 11-axis sustainability
      const businessSustain = clamp(50 + Math.min(50, orderCount / 2));
      const customerSustain = clamp(60 + (compass.filter((c) => c.customer_trust >= 75).length * 4));
      const financialSustain = clamp(orderCount > 0 ? 70 : 55);
      const technicalSustain = clamp(lastOmegaScore);
      const operationalSustain = clamp(65 + Math.min(25, evidenceCount / 20));
      const architecturalSustain = clamp(lastOmegaScore - 5);
      const knowledgeSustain = clamp(50 + Math.min(45, evidenceCount / 10));
      const executiveGovernance = clamp(lastOmegaScore);
      const longTermReadiness = clamp((businessSustain + customerSustain + financialSustain) / 3);
      const centuryReadiness = clamp((customerSustain + knowledgeSustain + architecturalSustain) / 3);
      const overallMaturity = clamp(
        (businessSustain + customerSustain + financialSustain + technicalSustain +
         operationalSustain + architecturalSustain + knowledgeSustain +
         executiveGovernance + longTermReadiness + centuryReadiness) / 10
      );

      const narrative = `Perpetual cycle complete. ${learnings.join(' ')} Overall company maturity: ${overallMaturity}/100. Century readiness: ${centuryReadiness}/100.`;
      const certPayload = {
        cycle_id: cycleRow?.id ?? null,
        business_sustainability: businessSustain,
        customer_sustainability: customerSustain,
        financial_sustainability: financialSustain,
        technical_sustainability: technicalSustain,
        operational_sustainability: operationalSustain,
        architectural_sustainability: architecturalSustain,
        knowledge_sustainability: knowledgeSustain,
        executive_governance: executiveGovernance,
        long_term_readiness: longTermReadiness,
        century_readiness: centuryReadiness,
        overall_company_maturity: overallMaturity,
        narrative,
        evidence: { orderCount, sessionCount, pinCount, evidenceCount, lastOmegaScore, compass_count: compass.length },
      };
      const certFp = await sha256(JSON.stringify(certPayload));
      const { data: certRow } = await supa
        .from('genesis_perpetual_certifications')
        .insert({ ...certPayload, fingerprint_sha256: certFp })
        .select('*')
        .single();

      return new Response(JSON.stringify({ ok: true, cycle_id: cycleRow?.id, certification: certRow }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
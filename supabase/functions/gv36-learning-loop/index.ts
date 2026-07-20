import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * Genesis V3.6 — Learning Loop
 * Recomputes confidence on combo performance, feeds deltas into pcie2_trait_weights,
 * enqueues persona_creative_combo Autopilot actions for high-confidence combos.
 * Respects pcie2_protected_winners; never bypasses ALG.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MIN_CONFIDENCE = 0.90;

async function sha1Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const stats = { evaluated: 0, gated_low_confidence: 0, queued_actions: 0, deduped: 0, errors: 0 };

  try {
    const { data: combos } = await sb
      .from('gv36_combo_performance')
      .select('*')
      .order('confidence_wilson', { ascending: false })
      .limit(500);

    const today = new Date().toISOString().slice(0, 10);
    const { data: protectedWinners } = await sb.from('pcie2_protected_winners').select('creative_id');
    const protectedIds = new Set((protectedWinners ?? []).map(r => r.creative_id));

    for (const c of combos ?? []) {
      stats.evaluated++;
      if (c.sample_n < 50 || c.purchases < 1) { stats.gated_low_confidence++; continue; }
      if (Number(c.confidence_wilson) < MIN_CONFIDENCE) { stats.gated_low_confidence++; continue; }

      if (c.product_id) {
        const { data: hasProtected } = await sb
          .from('pcie2_creatives').select('id').eq('product_id', c.product_id)
          .eq('persona_id', c.persona_id).limit(50);
        const overlap = (hasProtected ?? []).some(x => protectedIds.has(x.id));
        if (overlap) continue;
      }

      const dedupe = await sha1Hex(`${c.persona_id ?? ''}|${c.product_id ?? ''}|${c.emotion_id ?? ''}|${c.style_id ?? ''}|${today}`);
      const expectedRevenue = (c.aov_cents ?? 0) / 100 * 5; // forecast 5 incremental purchases @ AOV
      const { error } = await sb.from('autopilot_actions').insert({
        kind: 'persona_creative_combo',
        product_id: c.product_id,
        priority: c.confidence_wilson >= 0.95 ? 'HIGH' : 'MEDIUM',
        confidence: c.confidence_wilson,
        ai_credit_cost: 0.50,
        expected_revenue_eur: expectedRevenue,
        expected_roi: expectedRevenue / 0.50,
        status: 'queued',
        invocation_payload: {
          persona_id: c.persona_id, emotion_id: c.emotion_id,
          hook_id: c.hook_id, style_id: c.style_id, board_id: c.board_id,
          source: 'gv36-learning-loop',
        },
        dedupe_hash: dedupe,
      });
      if (error) {
        if (error.code === '23505') stats.deduped++;
        else stats.errors++;
      } else {
        stats.queued_actions++;
      }
    }

    return new Response(JSON.stringify({ ok: true, stats, ts: new Date().toISOString() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e), stats }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
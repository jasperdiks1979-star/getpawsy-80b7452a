import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Feature groups extracted from creative DNA. Each (group,value) row aggregates
// performance and yields a correlation/lift figure with confidence + reliability.
const FEATURE_GROUPS = [
  'headline_style','emotion','color_palette','composition','product_size',
  'product_placement','background','typography','cta_style','animal_breed',
  'lighting','visual_complexity',
] as const;

const MIN_SAMPLE = 8; // below this we mark insufficient

function reliability(n: number, conf: number): string {
  if (n < MIN_SAMPLE) return 'insufficient';
  if (n < 30) return 'low';
  if (conf < 0.6) return 'medium';
  return 'high';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const runIns = await supa.from('pcie2_learning_runs').insert({ run_type: 'nightly_learn' }).select('id').single();
    const runId = runIns.data?.id;

    const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
    const { data: perf } = await supa
      .from('pcie2_pin_performance')
      .select('pin_id, impressions, ctr, engagement_rate, creative_dna, headline, hook, cta, category')
      .gte('measured_at', since)
      .limit(20000);

    const rows = perf ?? [];
    const overall = rows.length
      ? rows.reduce((a, r) => a + (Number((r as any).ctr) || 0), 0) / rows.length
      : 0;

    type Bucket = { ctrSum: number; engSum: number; n: number };
    const buckets = new Map<string, Bucket>();
    function add(group: string, value: string | null | undefined, r: any) {
      if (!value) return;
      const k = `${group}::${value}`;
      const b = buckets.get(k) ?? { ctrSum: 0, engSum: 0, n: 0 };
      b.ctrSum += Number(r.ctr) || 0;
      b.engSum += Number(r.engagement_rate) || 0;
      b.n += 1;
      buckets.set(k, b);
    }
    for (const r of rows) {
      const dna = (r as any).creative_dna ?? {};
      for (const g of FEATURE_GROUPS) add(g, dna[g], r);
    }

    // Clear stale 30d rows then insert fresh
    await supa.from('pcie2_feature_attribution').delete().eq('window_days', 30);

    const attribRows: any[] = [];
    for (const [k, b] of buckets.entries()) {
      const [feature_group, feature_value] = k.split('::');
      const meanCtr = b.ctrSum / b.n;
      const lift = overall > 0 ? (meanCtr - overall) / overall : 0;
      // Crude confidence: shrinks with low n, grows with absolute lift
      const conf = Math.max(0, Math.min(1, (b.n / 50) * Math.min(1, Math.abs(lift) * 4)));
      attribRows.push({
        feature_group, feature_value, metric: 'ctr',
        correlation: Number(lift.toFixed(4)),
        lift_pct: Number((lift * 100).toFixed(2)),
        sample_size: b.n, confidence: Number(conf.toFixed(3)),
        reliability: reliability(b.n, conf), window_days: 30,
        evidence: { mean_ctr: meanCtr, overall_ctr: overall },
      });
    }
    if (attribRows.length) await supa.from('pcie2_feature_attribution').insert(attribRows);

    // Build insights: top 5 high-confidence winners, bottom 5 losers
    const reliable = attribRows.filter(r => r.reliability !== 'insufficient');
    const winners = [...reliable].sort((a, b) => b.lift_pct - a.lift_pct).slice(0, 5);
    const losers = [...reliable].sort((a, b) => a.lift_pct - b.lift_pct).slice(0, 5);
    const insights = [
      ...winners.map(w => ({
        kind: 'winner',
        headline: `${w.feature_group}: ${w.feature_value} → +${w.lift_pct}% CTR`,
        detail: `Based on ${w.sample_size} pins over 30 days.`,
        confidence: w.confidence, sample_size: w.sample_size,
        reliability: w.reliability, evidence: w.evidence,
      })),
      ...losers.map(w => ({
        kind: 'loser',
        headline: `${w.feature_group}: ${w.feature_value} → ${w.lift_pct}% CTR`,
        detail: `Based on ${w.sample_size} pins over 30 days.`,
        confidence: w.confidence, sample_size: w.sample_size,
        reliability: w.reliability, evidence: w.evidence,
      })),
    ];
    if (rows.length < MIN_SAMPLE * 3) {
      insights.unshift({
        kind: 'notice',
        headline: 'Insufficient evidence',
        detail: `Only ${rows.length} pin-snapshots in last 30 days. Learning paused until more data is collected.`,
        confidence: 0, sample_size: rows.length, reliability: 'insufficient', evidence: {},
      });
    }
    if (insights.length) await supa.from('pcie2_insights').insert(insights);

    await supa.from('pcie2_learning_runs').update({
      status: 'completed', finished_at: new Date().toISOString(),
      totals: { rows: rows.length, attribution: attribRows.length, insights: insights.length, overall_ctr: overall },
    }).eq('id', runId);

    return new Response(JSON.stringify({ ok: true, rows: rows.length, attribution: attribRows.length, insights: insights.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
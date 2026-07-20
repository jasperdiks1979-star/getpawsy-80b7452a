import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const runIns = await supa.from('pcie2_learning_runs').insert({ run_type: 'performance_sync' }).select('id').single();
    const runId = runIns.data?.id;

    // Pull last 90 days of perf snapshots
    const since = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
    const { data: perf } = await supa
      .from('pinterest_pin_performance')
      .select('pin_id, impressions, saves, clicks, closeups, snapshot_date, product_slug, board_id, category')
      .gte('snapshot_date', since)
      .limit(5000);

    let upserts = 0;
    for (const row of perf ?? []) {
      const impressions = Number((row as any).impressions ?? 0);
      const saves = Number((row as any).saves ?? 0);
      const clicks = Number((row as any).clicks ?? 0);
      const closeups = Number((row as any).closeups ?? 0);
      const ctr = impressions > 0 ? clicks / impressions : null;
      const eng = impressions > 0 ? (saves + clicks + closeups) / impressions : null;
      const measured_at = (row as any).snapshot_date ?? new Date().toISOString();
      const { error } = await supa.from('pcie2_pin_performance').upsert({
        pin_id: (row as any).pin_id,
        measured_at,
        impressions, saves, outbound_clicks: clicks, closeups,
        ctr, engagement_rate: eng,
        product_slug: (row as any).product_slug ?? null,
        category: (row as any).category ?? null,
        board_id: (row as any).board_id ?? null,
        raw: row as any,
      }, { onConflict: 'pin_id,measured_at' });
      if (!error) upserts++;
    }
    await supa.from('pcie2_learning_runs').update({
      status: 'completed', finished_at: new Date().toISOString(),
      totals: { upserts, scanned: perf?.length ?? 0 },
    }).eq('id', runId);
    return new Response(JSON.stringify({ ok: true, upserts, scanned: perf?.length ?? 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
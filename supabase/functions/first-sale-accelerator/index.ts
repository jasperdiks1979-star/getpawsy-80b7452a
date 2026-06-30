import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

type Json = Record<string, unknown>;

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: runRow } = await supabase
    .from('gv6_runs')
    .insert({ status: 'running' })
    .select('id')
    .single();
  const runId = runRow?.id as string | undefined;

  try {
    // 1) Pull active in-stock products
    const { data: products, error: pErr } = await supabase
      .from('products')
      .select('id, slug, name, price, cost_price, image_url, stock, stock_sync_status')
      .eq('is_active', true)
      .eq('stock_sync_status', 'ok')
      .gt('stock', 0);
    if (pErr) throw pErr;
    const prods = (products ?? []) as Array<Json & { id: string; slug?: string; name?: string; price?: number; cost_price?: number }>;

    // 2) Pull existing signals (reuse existing engines)
    const ids = prods.map((p) => p.id as string);
    const [{ data: revOpp }, { data: pinPerf }, { data: cciAgg }] = await Promise.all([
      supabase.from('pinterest_revenue_opportunity_scores').select('product_id, score_0_1000, bestseller_p, viral_p, tier').in('product_id', ids),
      // last 30d pin performance aggregated server-side
      supabase.from('pcie2_pin_performance').select('product_id, impressions, saves, outbound_clicks, ctr').in('product_id', ids).gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
      supabase.from('cci_events').select('product_id, stage').in('product_id', ids).gte('created_at', new Date(Date.now() - 14 * 86400000).toISOString()).limit(10000),
    ]);

    const revMap = new Map<string, { score: number; viral: number }>();
    for (const r of revOpp ?? []) revMap.set(r.product_id as string, { score: Number((r as Json).score_0_1000 ?? 0), viral: Number((r as Json).viral_p ?? 0) });

    const perfAgg = new Map<string, { impressions: number; saves: number; clicks: number; ctrSum: number; n: number }>();
    for (const r of pinPerf ?? []) {
      const k = String((r as Json).product_id);
      const e = perfAgg.get(k) ?? { impressions: 0, saves: 0, clicks: 0, ctrSum: 0, n: 0 };
      e.impressions += Number((r as Json).impressions ?? 0);
      e.saves += Number((r as Json).saves ?? 0);
      e.clicks += Number((r as Json).outbound_clicks ?? 0);
      e.ctrSum += Number((r as Json).ctr ?? 0);
      e.n += 1;
      perfAgg.set(k, e);
    }

    const cciAggMap = new Map<string, { atc: number; checkout: number; pdp: number }>();
    for (const r of cciAgg ?? []) {
      const k = String((r as Json).product_id ?? '');
      if (!k) continue;
      const e = cciAggMap.get(k) ?? { atc: 0, checkout: 0, pdp: 0 };
      const s = String((r as Json).stage ?? '');
      if (s.includes('add_to_cart')) e.atc += 1;
      else if (s.includes('checkout')) e.checkout += 1;
      else if (s.includes('product_view') || s.includes('pdp')) e.pdp += 1;
      cciAggMap.set(k, e);
    }

    const hasHistorical = (perfAgg.size + cciAggMap.size) > 10;
    const mode = hasHistorical ? 'exploitation' : 'exploration';

    // 3) Score each product (0..100)
    const rows = prods.map((p) => {
      const rev = revMap.get(p.id) ?? { score: 0, viral: 0 };
      const perf = perfAgg.get(p.id);
      const cci = cciAggMap.get(p.id) ?? { atc: 0, checkout: 0, pdp: 0 };
      const price = Number(p.price ?? 0);
      const cost = Number(p.cost_price ?? 0);
      const margin = price > 0 ? (price - cost) / price : 0;

      // Component scores (each 0..100)
      const revC = clamp(rev.score / 10);
      const ctr = perf && perf.n > 0 ? perf.ctrSum / perf.n : 0;
      const ctrC = clamp(ctr * 4000); // CTR 0.025 -> 100
      const saveC = perf && perf.impressions > 0 ? clamp((perf.saves / perf.impressions) * 5000) : 0;
      const clickC = perf ? clamp(perf.clicks * 2) : 0;
      const atcC = clamp(cci.atc * 8);
      const checkoutC = clamp(cci.checkout * 25);
      const pdpC = clamp(cci.pdp * 1.5);
      // Impulse-price: 19-49 USD ideal
      const priceC = price >= 19 && price <= 49 ? 100 : price > 0 ? clamp(100 - Math.abs(34 - price) * 2) : 0;
      const marginC = clamp(margin * 200);
      const visualC = p.image_url ? 70 : 0;

      let fsps: number;
      let components: Json;
      if (mode === 'exploration') {
        // Bias toward broad appeal proxies when we have no historical signal
        fsps = clamp(
          priceC * 0.25 + marginC * 0.20 + revC * 0.25 + visualC * 0.10 + (saveC + ctrC) * 0.10 + (atcC + checkoutC + pdpC) * 0.10,
        );
        components = { mode, priceC, marginC, revC, visualC, ctrC, saveC, atcC, checkoutC, pdpC };
      } else {
        fsps = clamp(
          checkoutC * 0.25 + atcC * 0.20 + ctrC * 0.12 + saveC * 0.10 + clickC * 0.08 + revC * 0.10 + priceC * 0.07 + marginC * 0.05 + pdpC * 0.03,
        );
        components = { mode, checkoutC, atcC, ctrC, saveC, clickC, revC, priceC, marginC, pdpC };
      }

      return {
        product_id: p.id,
        product_slug: p.slug ?? null,
        product_name: p.name ?? null,
        fsps: Math.round(fsps),
        components,
        mode,
        computed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    rows.sort((a, b) => b.fsps - a.fsps);
    rows.forEach((r, i) => ((r as Json).rank = i + 1));

    // Upsert in batches
    for (let i = 0; i < rows.length; i += 200) {
      const batch = rows.slice(i, i + 200);
      const { error } = await supabase
        .from('gv6_first_sale_scores')
        .upsert(batch, { onConflict: 'product_id' });
      if (error) throw error;
    }

    // 4) Reprioritize queued pins: top 50 products -> priority 95, next 100 -> 80
    const top50 = rows.slice(0, 50).map((r) => r.product_id);
    const top150 = rows.slice(0, 150).map((r) => r.product_id);
    let reprioritized = 0;
    if (top50.length > 0) {
      const { error: e1, count: c1 } = await supabase
        .from('pinterest_pin_queue')
        .update({ priority: 'high', updated_at: new Date().toISOString() }, { count: 'exact' })
        .in('status', ['queued', 'draft'])
        .in('product_id', top50);
      if (e1) throw e1;
      reprioritized += c1 ?? 0;
    }
    if (top150.length > 0) {
      const { error: e2, count: c2 } = await supabase
        .from('pinterest_pin_queue')
        .update({ priority: 'medium', updated_at: new Date().toISOString() }, { count: 'exact' })
        .in('status', ['queued', 'draft'])
        .in('product_id', top150.filter((id) => !top50.includes(id)));
      if (e2) throw e2;
      reprioritized += c2 ?? 0;
    }

    // 5) Estimate hours to first sale via Bayesian-ish heuristic on top FSPS
    const top10 = rows.slice(0, 10);
    const avgTop = top10.reduce((s, r) => s + r.fsps, 0) / Math.max(1, top10.length);
    // 100 FSPS ~ 48h, 0 FSPS ~ 720h, log-ish curve
    const eta = clamp(720 - avgTop * 6.7, 24, 720);

    await supabase
      .from('gv6_runs')
      .update({
        status: 'completed',
        scored_count: rows.length,
        reprioritized_count: reprioritized,
        top_products: top10.map((r) => ({ slug: r.product_slug, name: r.product_name, fsps: r.fsps })),
        estimated_hours_to_first_sale: eta,
        details: { mode, hasHistorical, perfRows: perfAgg.size, cciRows: cciAggMap.size },
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId!);

    return new Response(
      JSON.stringify({
        ok: true,
        run_id: runId,
        mode,
        scored: rows.length,
        reprioritized,
        estimated_hours_to_first_sale: eta,
        top10: top10.map((r) => ({ slug: r.product_slug, name: r.product_name, fsps: r.fsps })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = (e as Error).message;
    if (runId) {
      await supabase.from('gv6_runs').update({ status: 'failed', error: msg, completed_at: new Date().toISOString() }).eq('id', runId);
    }
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
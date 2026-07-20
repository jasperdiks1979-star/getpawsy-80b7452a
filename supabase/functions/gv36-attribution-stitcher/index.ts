import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * Genesis V3.6 — Attribution Stitcher
 * Links every published pin to its creative/persona/emotion/hook/style/board/campaign/product,
 * pulls Pinterest metrics, joins with canonical sessions, and updates combo performance + first-sale memory.
 * Never duplicates Canonical Analytics — reads only.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const startedAt = new Date().toISOString();

  const stats = { scanned: 0, linked: 0, skipped: 0, errors: 0, purchases_recorded: 0, combos_upserted: 0 };

  try {
    // 1. Find recently published pins not yet linked
    const { data: pins, error: pinErr } = await sb
      .from('pinterest_pin_queue')
      .select('id, pinterest_pin_id, board_id, product_id, pcie2_creative_id, posted_at, meta')
      .eq('status', 'published')
      .not('pinterest_pin_id', 'is', null)
      .gte('posted_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
      .limit(500);
    if (pinErr) throw pinErr;

    const pinIds = (pins ?? []).map(p => p.pinterest_pin_id).filter(Boolean) as string[];
    const { data: existing } = await sb
      .from('gv36_attribution_links')
      .select('pin_id')
      .in('pin_id', pinIds.length ? pinIds : ['__none__']);
    const known = new Set((existing ?? []).map(r => r.pin_id));

    for (const p of pins ?? []) {
      stats.scanned++;
      const pinId = p.pinterest_pin_id as string;
      if (known.has(pinId)) { stats.skipped++; continue; }

      let creative: any = null;
      if (p.pcie2_creative_id) {
        const { data: c } = await sb
          .from('pcie2_creatives')
          .select('id, product_id, persona_id, emotion_id, style_id, hook_id, board_id, campaign_id')
          .eq('id', p.pcie2_creative_id).maybeSingle();
        creative = c;
      }

      const { error: insErr } = await sb.from('gv36_attribution_links').upsert({
        pin_id: pinId,
        creative_id: creative?.id ?? null,
        persona_id: creative?.persona_id ?? null,
        product_id: creative?.product_id ?? p.product_id ?? null,
        emotion_id: creative?.emotion_id ?? null,
        hook_id: creative?.hook_id ?? null,
        style_id: creative?.style_id ?? null,
        board_id: creative?.board_id ?? p.board_id ?? null,
        campaign_id: creative?.campaign_id ?? 'pcie2',
        published_at: p.posted_at ?? new Date().toISOString(),
        meta: { queue_id: p.id, source: 'pinterest_pin_queue' },
      }, { onConflict: 'pin_id' });
      if (insErr) { stats.errors++; continue; }
      stats.linked++;
    }

    // 2. Roll up combo performance from joined Pinterest + canonical data (last 90d)
    const { data: combos, error: comboErr } = await sb.rpc('exec' as never, {} as never).then(
      () => ({ data: null, error: null }), () => ({ data: null, error: null })
    );
    // Direct select via SQL using the views isn't possible here; perform aggregation client-side.
    const { data: links } = await sb
      .from('gv36_attribution_links')
      .select('persona_id, emotion_id, hook_id, style_id, board_id, product_id, pin_id, creative_id');
    const byCombo = new Map<string, any>();
    for (const l of links ?? []) {
      const key = [l.persona_id ?? '', l.emotion_id ?? '', l.hook_id ?? '', l.style_id ?? '', l.board_id ?? '', l.product_id ?? ''].join('|');
      const e = byCombo.get(key) ?? { ...l, pin_ids: [] as string[], creative_ids: new Set<string>() };
      e.pin_ids.push(l.pin_id);
      if (l.creative_id) e.creative_ids.add(l.creative_id);
      byCombo.set(key, e);
    }

    for (const [, c] of byCombo) {
      const { data: perf } = await sb
        .from('pinterest_pin_performance')
        .select('impressions, saves, clicks')
        .in('pin_id', c.pin_ids);
      const imp = (perf ?? []).reduce((a, r) => a + (r.impressions ?? 0), 0);
      const sav = (perf ?? []).reduce((a, r) => a + (r.saves ?? 0), 0);
      const clk = (perf ?? []).reduce((a, r) => a + (r.clicks ?? 0), 0);
      const ctr = imp > 0 ? clk / imp : 0;

      // Lookup purchases recorded in first sale memory for this combo
      const { data: memRows } = await sb
        .from('gv36_first_sale_memory')
        .select('revenue_cents')
        .eq('persona_id', c.persona_id)
        .eq('product_id', c.product_id);
      const purchases = memRows?.length ?? 0;
      const revenue = (memRows ?? []).reduce((a, r) => a + (r.revenue_cents ?? 0), 0);
      const aov = purchases > 0 ? Math.round(revenue / purchases) : 0;

      // Wilson 90% lower bound on purchases / clicks
      const n = clk || 1;
      const p̂ = purchases / n;
      const z = 1.6449; // 90% one-sided
      const denom = 1 + (z * z) / n;
      const centre = p̂ + (z * z) / (2 * n);
      const margin = z * Math.sqrt((p̂ * (1 - p̂) + (z * z) / (4 * n)) / n);
      const wilson = Math.max(0, (centre - margin) / denom);

      let status: string = 'stable';
      if (purchases >= 3 && imp >= 500) status = 'winning';
      else if (clk >= 50 && imp >= 200) status = 'growing';
      else if (imp >= 200 && clk < 5) status = 'declining';
      else if (imp >= 1000 && purchases === 0) status = 'needs_refresh';

      const { error: upErr } = await sb.from('gv36_combo_performance').upsert({
        persona_id: c.persona_id, emotion_id: c.emotion_id, hook_id: c.hook_id,
        style_id: c.style_id, board_id: c.board_id, product_id: c.product_id,
        impressions: imp, saves: sav, clicks: clk, ctr,
        purchases, revenue_cents: revenue, aov_cents: aov,
        confidence_wilson: wilson, sample_n: n,
        status, last_evaluated_at: new Date().toISOString(),
        evidence_sources: { pin_count: c.pin_ids.length, creative_count: c.creative_ids.size },
      }, { onConflict: 'persona_id,emotion_id,hook_id,style_id,board_id,product_id' });
      if (!upErr) stats.combos_upserted++;
    }

    // 3. Append first-sale memory for purchases (last 90d) not yet recorded
    const { data: purchases } = await sb
      .from('canonical_events')
      .select('order_id, occurred_at, utm_content, utm_campaign, product_id, value_cents, landing_page, referrer')
      .eq('canonical_name', 'CANONICAL_PURCHASE')
      .gte('occurred_at', new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString())
      .not('order_id', 'is', null)
      .limit(500);
    const orderIds = (purchases ?? []).map(p => p.order_id).filter(Boolean);
    const { data: alreadyMem } = await sb
      .from('gv36_first_sale_memory')
      .select('order_id')
      .in('order_id', orderIds.length ? orderIds : ['00000000-0000-0000-0000-000000000000']);
    const memSet = new Set((alreadyMem ?? []).map(r => r.order_id));

    for (const p of purchases ?? []) {
      if (memSet.has(p.order_id)) continue;
      // Resolve persona via utm_content = persona_<uuid>
      const personaMatch = (p.utm_content ?? '').match(/^persona_([0-9a-f-]{36})/i);
      const persona_id = personaMatch ? personaMatch[1] : null;
      const { error: memErr } = await sb.from('gv36_first_sale_memory').insert({
        order_id: p.order_id, product_id: null, persona_id,
        campaign_id: p.utm_campaign ?? null,
        revenue_cents: p.value_cents ?? 0,
        traffic_path: [{ landing: p.landing_page, referrer: p.referrer, utm_content: p.utm_content }],
        meta: { source: 'canonical_events' },
      });
      if (!memErr) stats.purchases_recorded++;
    }

    await sb.from('gv36_attribution_links').update({ last_metric_sync: new Date().toISOString() })
      .gte('published_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString());

    return new Response(JSON.stringify({ ok: true, started_at: startedAt, stats }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e), stats }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
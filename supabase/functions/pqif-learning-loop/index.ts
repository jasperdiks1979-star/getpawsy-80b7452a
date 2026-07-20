// PQIF v2 post-publish learning loop.
// Aggregates Pinterest performance by creative/headline/hook family,
// updates frequency_multiplier (boost winners, throttle losers),
// queues retirement for chronically underperforming pins.

import { corsHeaders } from "../_shared/cors.ts";
import { getServiceClient, loadSettings } from "../_shared/pinterest-quality-firewall-v2.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = getServiceClient();
  const settings = await loadSettings(sb);

  // Pull last 30d of pin performance with attached family keys
  const { data: perf } = await sb
    .from("pcie2_pin_performance")
    .select("queue_id, impressions, saves, outbound_clicks, conversions, ctr, engagement_rate, conversion_rate, family_key, family_type")
    .gte("updated_at", new Date(Date.now() - 30 * 86400_000).toISOString())
    .limit(10000);

  const buckets = new Map<string, any>();
  for (const row of perf ?? []) {
    const key = `${(row as any).family_type ?? "creative"}::${(row as any).family_key ?? "unknown"}`;
    const b = buckets.get(key) ?? { family_type: (row as any).family_type ?? "creative", family_key: (row as any).family_key ?? "unknown", pins: 0, imp: 0, sav: 0, clk: 0, cnv: 0 };
    b.pins++; b.imp += (row as any).impressions ?? 0; b.sav += (row as any).saves ?? 0;
    b.clk += (row as any).outbound_clicks ?? 0; b.cnv += (row as any).conversions ?? 0;
    buckets.set(key, b);
  }

  const upserts: any[] = [];
  for (const b of buckets.values()) {
    const ctr = b.imp > 0 ? b.clk / b.imp : 0;
    const eng = b.imp > 0 ? (b.sav + b.clk) / b.imp : 0;
    const cvr = b.clk > 0 ? b.cnv / b.clk : 0;
    const perfScore = +(100 * (0.5 * ctr / 0.01 + 0.3 * eng / 0.05 + 0.2 * cvr / 0.02)).toFixed(2);
    let mult = 1.0;
    if (perfScore >= 120) mult = 1.5;
    else if (perfScore >= 90) mult = 1.2;
    else if (perfScore < 40) mult = 0.5;
    else if (perfScore < 60) mult = 0.75;
    upserts.push({
      family_type: b.family_type, family_key: b.family_key,
      pins_published: b.pins, impressions: b.imp, saves: b.sav,
      outbound_clicks: b.clk, conversions: b.cnv,
      ctr: +ctr.toFixed(4), engagement_rate: +eng.toFixed(4), conversion_rate: +cvr.toFixed(4),
      performance_score: perfScore, frequency_multiplier: mult,
      last_evaluated_at: new Date().toISOString(),
    });
  }
  if (upserts.length) {
    await sb.from("pqif_family_performance").upsert(upserts, { onConflict: "family_type,family_key" });
  }

  // Retire underperforming pins
  const { data: losers } = await sb.from("pcie2_pin_performance")
    .select("queue_id, impressions, ctr")
    .gte("impressions", settings.retire_after_impressions)
    .lt("ctr", settings.retire_ctr_below).limit(500);
  let retired = 0;
  for (const l of losers ?? []) {
    const { error } = await sb.from("pinterest_pin_queue").update({
      status: "retired", rejection_reason: `pqif_v2_retired_low_ctr(${(l as any).ctr})`,
    }).eq("id", (l as any).queue_id).eq("status", "posted");
    if (!error) retired++;
  }

  return new Response(JSON.stringify({
    ok: true, families_updated: upserts.length, retired,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
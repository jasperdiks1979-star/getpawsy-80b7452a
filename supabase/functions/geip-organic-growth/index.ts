// Organic Growth Engine — dormant until readiness passes.
import { corsHeaders, jsonResponse, serviceClient, startRun, finishRun } from "../_shared/geip-common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = serviceClient();
  const runId = await startRun(sb, "organic_growth");
  const { data: readiness } = await sb.rpc("geip_readiness");
  if (!readiness?.organic_growth_ready) {
    await finishRun(sb, runId, { status: "waiting_for_auth", blocker: "learning_phase", metadata: readiness ?? {} });
    return jsonResponse({ ok: false, dormant: true, readiness });
  }

  // Rank keyword-gap opportunities: pages ranking 4-15 with high impressions and low CTR
  const { data: pages } = await sb.from("geip_gsc_daily")
    .select("dimension_value, clicks, impressions, ctr, position")
    .eq("dimension", "page")
    .gte("date", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10))
    .order("impressions", { ascending: false })
    .limit(500);

  // Deactivate stale
  await sb.from("geip_opportunities").update({ is_active: false }).eq("is_active", true);

  const rows: any[] = [];
  for (const r of pages ?? []) {
    const pos = Number((r as any).position ?? 0);
    const imp = (r as any).impressions | 0;
    const clk = (r as any).clicks | 0;
    if (pos >= 4 && pos <= 15 && imp >= 100) {
      const expectedClicks = Math.round(imp * 0.15);
      rows.push({
        kind: "keyword_gap", target_url: (r as any).dimension_value,
        expected_traffic_lift: Math.max(0, expectedClicks - clk),
        expected_revenue_cents: (expectedClicks - clk) * 50, // $0.50 conservative eCPC proxy
        confidence: 0.6,
        evidence: { position: pos, impressions: imp, clicks: clk, source: "geip_gsc_daily" },
        is_active: true,
      });
    }
  }
  if (rows.length) await sb.from("geip_opportunities").insert(rows.slice(0, 100));
  await finishRun(sb, runId, { status: "ok", rows_ingested: rows.length });
  return jsonResponse({ ok: true, opportunities: rows.length });
});
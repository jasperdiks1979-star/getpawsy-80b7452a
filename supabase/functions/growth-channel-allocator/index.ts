import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

// Phase 7a — Channel budget allocator
// Reads 14d performance per channel, computes ROAS-weighted shares,
// updates growth_channel_budget.share_pct + allocated for autopilot channels.

function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    const { data: sig, error } = await sb
      .from("growth_channel_signals")
      .select("channel, impressions, clicks, conversions, revenue, spend, score")
      .gte("day", since);
    if (error) throw error;

    const agg = new Map<string, { imp: number; clk: number; conv: number; rev: number; spend: number; score: number }>();
    for (const r of sig ?? []) {
      const k = String((r as any).channel);
      const cur = agg.get(k) ?? { imp: 0, clk: 0, conv: 0, rev: 0, spend: 0, score: 0 };
      cur.imp += Number((r as any).impressions ?? 0);
      cur.clk += Number((r as any).clicks ?? 0);
      cur.conv += Number((r as any).conversions ?? 0);
      cur.rev += Number((r as any).revenue ?? 0);
      cur.spend += Number((r as any).spend ?? 0);
      cur.score += Number((r as any).score ?? 0);
      agg.set(k, cur);
    }

    // Compute weight per channel: ROAS+1, fallback to score
    const weights = new Map<string, number>();
    for (const ch of ["pinterest", "tiktok", "google_ads"]) {
      const m = agg.get(ch);
      if (!m) { weights.set(ch, 0); continue; }
      const roas = m.spend > 0 ? m.rev / m.spend : (m.rev > 0 ? 4 : 0);
      const w = (roas + 0.5) * (m.score / Math.max(1, (sig?.length ?? 1)));
      weights.set(ch, Math.max(0.01, w));
    }
    const total = Array.from(weights.values()).reduce((a, b) => a + b, 0) || 1;

    const { data: budgets } = await sb.from("growth_channel_budget").select("*");
    const totalDaily = (budgets ?? []).reduce((a: number, b: any) => a + Number(b.daily_budget ?? 0), 0);

    const updates: Array<Record<string, unknown>> = [];
    for (const ch of ["pinterest", "tiktok", "google_ads"]) {
      const row = (budgets ?? []).find((b: any) => b.channel === ch);
      if (!row) continue;
      const sharePct = (weights.get(ch) ?? 0) / total;
      const allocated = row.autopilot ? +(totalDaily * sharePct).toFixed(2) : Number(row.daily_budget);
      updates.push({
        channel: ch,
        daily_budget: row.daily_budget,
        autopilot: row.autopilot,
        share_pct: +sharePct.toFixed(4),
        allocated,
        last_allocation_at: new Date().toISOString(),
        meta: { ...(row.meta ?? {}), perf: agg.get(ch) ?? null, weight: weights.get(ch) ?? 0 },
      });
    }

    if (updates.length) {
      const { error: upErr } = await sb
        .from("growth_channel_budget")
        .upsert(updates, { onConflict: "channel" });
      if (upErr) throw upErr;
    }

    await sb.from("growth_events").insert({
      event_type: "channel_allocation",
      payload: { trace_id: traceId, total_daily: totalDaily, updates } as any,
    });

    return json({ ok: true, traceId, total_daily: totalDaily, updates });
  } catch (e) {
    return json({ ok: false, traceId, message: (e as Error).message }, 500);
  }
});
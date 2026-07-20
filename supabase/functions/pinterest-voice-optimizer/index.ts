// Pinterest Voice Optimizer (cron daily 06:30 UTC).
// Aggregates voice performance per category over last 30d.
// After ≥50 pins in a category, learned weights are applied via
// pinterest_voice_performance.conversion_score.
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { VOICE_POOL } from "../_shared/voice-pool.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: assignments, error: aErr } = await supabase
      .from("pinterest_voice_assignments")
      .select("voice_name, category, pin_id, assigned_at")
      .gte("assigned_at", since);
    if (aErr) throw aErr;

    const pinIds = Array.from(new Set((assignments ?? []).map((a) => a.pin_id).filter(Boolean) as string[]));

    // Pull pin performance metrics in chunks.
    const perf: Record<string, { impressions: number; outbound: number; saves: number; ctr: number }> = {};
    for (let i = 0; i < pinIds.length; i += 500) {
      const slice = pinIds.slice(i, i + 500);
      const { data: rows } = await supabase
        .from("pinterest_pin_performance")
        .select("pin_id, impressions, outbound_clicks, saves, ctr")
        .in("pin_id", slice);
      for (const r of rows ?? []) {
        perf[r.pin_id as string] = {
          impressions: Number((r as any).impressions ?? 0),
          outbound: Number((r as any).outbound_clicks ?? 0),
          saves: Number((r as any).saves ?? 0),
          ctr: Number((r as any).ctr ?? 0),
        };
      }
    }

    // Pull revenue attribution for purchases.
    const purchases: Record<string, number> = {};
    for (let i = 0; i < pinIds.length; i += 500) {
      const slice = pinIds.slice(i, i + 500);
      const { data: rows } = await supabase
        .from("pinterest_revenue_attribution_v3")
        .select("pin_id, purchases, conversion_count")
        .in("pin_id", slice);
      for (const r of rows ?? []) {
        const k = r.pin_id as string;
        purchases[k] = (purchases[k] || 0) + Number((r as any).purchases ?? (r as any).conversion_count ?? 0);
      }
    }

    // Aggregate by (voice_name, category).
    const agg = new Map<string, {
      voice_name: string; category: string;
      pins_count: number; impressions: number; outbound: number; saves: number; purchases: number; ctr_sum: number;
    }>();
    for (const a of assignments ?? []) {
      const key = `${a.voice_name}::${a.category || "unknown"}`;
      const row = agg.get(key) ?? {
        voice_name: a.voice_name as string,
        category: (a.category as string) || "unknown",
        pins_count: 0, impressions: 0, outbound: 0, saves: 0, purchases: 0, ctr_sum: 0,
      };
      row.pins_count += 1;
      const p = a.pin_id ? perf[a.pin_id as string] : undefined;
      if (p) {
        row.impressions += p.impressions;
        row.outbound += p.outbound;
        row.saves += p.saves;
        row.ctr_sum += p.ctr;
      }
      if (a.pin_id) row.purchases += purchases[a.pin_id as string] || 0;
      agg.set(key, row);
    }

    let upserts = 0;
    for (const r of agg.values()) {
      const pinsCount = Math.max(r.pins_count, 1);
      const ctr = r.ctr_sum / pinsCount;
      const outboundRate = r.impressions > 0 ? r.outbound / r.impressions : 0;
      const saveRate = r.impressions > 0 ? r.saves / r.impressions : 0;
      const purchasesPerPin = r.purchases / pinsCount;
      const conversion_score =
        0.5 * purchasesPerPin +
        0.3 * outboundRate * 100 +
        0.15 * saveRate * 100 +
        0.05 * ctr;

      const { error: upErr } = await supabase
        .from("pinterest_voice_performance")
        .upsert({
          voice_name: r.voice_name,
          category: r.category,
          pins_count: r.pins_count,
          impressions: r.impressions,
          ctr,
          outbound_clicks: r.outbound,
          saves: r.saves,
          purchases: r.purchases,
          conversion_score,
          updated_at: new Date().toISOString(),
        }, { onConflict: "voice_name,category" });
      if (!upErr) upserts += 1;
    }

    return new Response(JSON.stringify({
      ok: true, traceId,
      message: `Optimized ${upserts} (voice,category) rows over last 30d`,
      assignments: assignments?.length ?? 0,
      pins_with_perf: Object.keys(perf).length,
      voices_in_pool: VOICE_POOL.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, traceId, message: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
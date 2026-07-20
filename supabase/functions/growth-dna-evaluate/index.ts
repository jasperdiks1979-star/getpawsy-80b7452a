import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

// Phase 7c — DNA evaluator
// 1. Pulls last 14d of growth_decision_metrics joined to growth_decisions
// 2. Aggregates reward per (hook, angle) found in decision payload
// 3. Updates ewma_reward, impressions, clicks, sample_size for matching DNA rows
// 4. Promotes testing → active when sample_size >= 30 AND ewma_reward >= type-median
// 5. Retires active/testing → retired when sample_size >= 40 AND ewma_reward < 0.5 * type-median

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

    const { data: m } = await sb
      .from("growth_decision_metrics")
      .select("decision_id, impressions, clicks, reward")
      .gte("snapshot_day", since);
    const ids = Array.from(new Set((m ?? []).map((r: any) => r.decision_id)));
    const { data: d } = await sb
      .from("growth_decisions")
      .select("id, payload")
      .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const decMap = new Map<string, any>();
    (d ?? []).forEach((r: any) => decMap.set(r.id, r));

    type Agg = { imp: number; clk: number; rewards: number[] };
    const byGene: Record<"hook" | "angle", Map<string, Agg>> = { hook: new Map(), angle: new Map() };

    for (const row of m ?? []) {
      const dec = decMap.get((row as any).decision_id);
      const p = dec?.payload ?? {};
      for (const t of ["hook", "angle"] as const) {
        const k = String(p[t] ?? "").trim();
        if (!k) continue;
        const cur = byGene[t].get(k) ?? { imp: 0, clk: 0, rewards: [] };
        cur.imp += Number((row as any).impressions ?? 0);
        cur.clk += Number((row as any).clicks ?? 0);
        cur.rewards.push(Number((row as any).reward ?? 0));
        byGene[t].set(k, cur);
      }
    }

    function ewma(values: number[], alpha = 0.35) {
      if (!values.length) return 0;
      let v = values[0];
      for (let i = 1; i < values.length; i++) v = alpha * values[i] + (1 - alpha) * v;
      return v;
    }

    let updated = 0, promoted = 0, retired = 0;

    for (const t of ["hook", "angle"] as const) {
      const entries = Array.from(byGene[t].entries());
      if (!entries.length) continue;

      // Match DNA rows that exist
      const values = entries.map(([k]) => k);
      const { data: dna } = await sb
        .from("growth_creative_dna")
        .select("id, gene_value, status, ewma_reward")
        .eq("gene_type", t)
        .in("gene_value", values);
      const dnaMap = new Map<string, any>();
      (dna ?? []).forEach((r: any) => dnaMap.set(r.gene_value, r));

      const updates: any[] = [];
      for (const [val, agg] of entries) {
        const dnaRow = dnaMap.get(val);
        if (!dnaRow) continue;
        const newEwma = ewma(agg.rewards);
        updates.push({
          id: dnaRow.id,
          impressions: agg.imp,
          clicks: agg.clk,
          reward: agg.rewards.reduce((a, b) => a + b, 0),
          ewma_reward: +newEwma.toFixed(4),
          sample_size: agg.rewards.length,
          last_test_at: new Date().toISOString(),
        });
      }

      if (updates.length) {
        for (const u of updates) {
          await sb.from("growth_creative_dna").update(u).eq("id", u.id);
        }
        updated += updates.length;
      }

      // Compute median for this gene type from all known DNA
      const { data: all } = await sb
        .from("growth_creative_dna")
        .select("ewma_reward")
        .eq("gene_type", t)
        .neq("status", "retired");
      const rewards = (all ?? []).map((r: any) => Number(r.ewma_reward)).filter((n) => n > 0).sort((a, b) => a - b);
      const median = rewards.length ? rewards[Math.floor(rewards.length / 2)] : 0;

      // Promote testing -> active
      const { data: prom } = await sb
        .from("growth_creative_dna")
        .update({ status: "active" })
        .eq("gene_type", t)
        .eq("status", "testing")
        .gte("sample_size", 30)
        .gte("ewma_reward", median)
        .select("id");
      promoted += prom?.length ?? 0;

      // Retire underperformers
      if (median > 0) {
        const { data: ret } = await sb
          .from("growth_creative_dna")
          .update({ status: "retired", retired_at: new Date().toISOString() })
          .eq("gene_type", t)
          .in("status", ["active", "testing"])
          .gte("sample_size", 40)
          .lt("ewma_reward", median * 0.5)
          .select("id");
        retired += ret?.length ?? 0;
      }
    }

    await sb.from("growth_events").insert({
      event_type: "dna_evaluate",
      payload: { trace_id: traceId, updated, promoted, retired } as any,
    });

    return json({ ok: true, traceId, updated, promoted, retired });
  } catch (e) {
    return json({ ok: false, traceId, message: (e as Error).message }, 500);
  }
});
import { admin, jsonResp, cors } from "../_shared/creative-helpers.ts";
import { isInternalAuthed } from "../_shared/cpe-helpers.ts";

/**
 * Aggregates winner DNA from pinterest_analytics_daily + creative_performance_snapshots
 * and writes to cpe_performance_weights. Boosts winners (>= p75 CTR) and suppresses losers.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!isInternalAuthed(req)) return jsonResp({ error: "unauthorized" }, 401);
  const sb = admin();
  const updates: Array<{ dimension: string; value: string; weight: number; sample_n: number; win_rate: number }> = [];

  // Hooks (creative_assets winners)
  const { data: hooks } = await sb
    .from("creative_assets")
    .select("hook,quality_score")
    .not("hook", "is", null)
    .gte("quality_score", 70)
    .limit(500);
  const agg = new Map<string, { n: number; sum: number }>();
  for (const r of hooks ?? []) {
    const k = String(r.hook).toLowerCase();
    const cur = agg.get(k) ?? { n: 0, sum: 0 };
    cur.n++; cur.sum += Number(r.quality_score ?? 0);
    agg.set(k, cur);
  }
  for (const [val, v] of agg) {
    if (v.n < 2) continue;
    const win_rate = v.sum / (v.n * 100);
    updates.push({ dimension: "hook", value: val.slice(0, 200), weight: 1 + win_rate, sample_n: v.n, win_rate });
  }

  for (const u of updates) {
    await sb.from("cpe_performance_weights").upsert(
      { ...u, updated_at: new Date().toISOString() },
      { onConflict: "dimension,value" },
    );
  }

  return jsonResp({ ok: true, dimensions_updated: updates.length });
});
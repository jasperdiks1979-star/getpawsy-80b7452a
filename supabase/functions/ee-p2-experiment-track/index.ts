import { corsHeaders, svc, requireAdmin, ok, err } from "../_shared/ee-p2-common.ts";

// Observation-only experiment tracker. Bucketizes recent published creatives by
// experiment dimension and computes winners by CTR. Never mutates publishing.
const TYPES = ["headline", "hook", "cta", "board", "image_style", "emotion", "posting_time", "aspect_ratio"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const guard = await requireAdmin(req);
  if (!guard.ok) return guard.res;
  const sb = svc();
  try {
    const { data: perf } = await sb
      .from("pcie2_pin_performance")
      .select("pin_id, creative_id, impressions, outbound_clicks, saves, board_id, observed_at, headline, hook, cta")
      .gte("observed_at", new Date(Date.now() - 14 * 86400000).toISOString())
      .limit(5000);

    const results: any[] = [];
    for (const type of TYPES) {
      const buckets: Record<string, { imp: number; clk: number; n: number }> = {};
      for (const r of perf ?? []) {
        let key = "default";
        const rr = r as any;
        if (type === "headline") key = String(rr.headline ?? "").slice(0, 40);
        else if (type === "hook") key = String(rr.hook ?? "").slice(0, 40);
        else if (type === "cta") key = String(rr.cta ?? "default");
        else if (type === "board") key = String(rr.board_id ?? "default");
        else if (type === "posting_time") key = String(new Date(rr.observed_at).getUTCHours());
        else if (type === "aspect_ratio") key = "2:3"; // pinterest default
        else continue;
        if (!key) continue;
        buckets[key] ??= { imp: 0, clk: 0, n: 0 };
        buckets[key].imp += Number(rr.impressions ?? 0);
        buckets[key].clk += Number(rr.outbound_clicks ?? 0);
        buckets[key].n += 1;
      }
      const variants = Object.entries(buckets)
        .filter(([, v]) => v.imp >= 100)
        .map(([k, v]) => ({ variant: k, impressions: v.imp, clicks: v.clk, ctr: v.imp ? v.clk / v.imp : 0, n: v.n }))
        .sort((a, b) => b.ctr - a.ctr);
      if (variants.length < 2) continue;
      const winner = variants[0];
      const baseline = variants[variants.length - 1];
      const uplift = baseline.ctr ? (winner.ctr - baseline.ctr) / baseline.ctr : 0;
      const totalN = variants.reduce((s, v) => s + v.n, 0);
      results.push({
        experiment_type: type,
        hypothesis: `Observed CTR variance by ${type}`,
        status: variants[0].n >= 5 ? "complete" : "observing",
        variants: variants.slice(0, 10),
        winner_variant: winner.variant,
        confidence: Math.min(1, totalN / 50),
        uplift,
        sample_size: totalN,
        completed_at: new Date().toISOString(),
      });
    }

    if (results.length) await sb.from("ee_p2_experiments").insert(results);
    return ok({ experiments: results.length });
  } catch (e) {
    return err(String(e));
  }
});
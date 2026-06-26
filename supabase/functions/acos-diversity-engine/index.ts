import { corsHeaders, requireAdmin, svc, ok, err, canRun } from "../_shared/acos-common.ts";
const TARGET: Record<string,number> = { cats:0.18, dogs:0.20, beds:0.10, travel:0.08, health:0.10, cleaning:0.08, accessories:0.08, toys:0.08, feeding:0.05, outdoor:0.03, small_pets:0.02 };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const gate = await canRun("diversity_engine"); if (!gate.allowed) return err(`gated: ${gate.reason}`, 423);
  const sb = svc();
  const window_start = new Date(Date.now()-24*3600_000);
  const { data } = await sb.from("pinterest_publish_logs").select("payload").gte("created_at", window_start.toISOString()).limit(2000);
  const counts = new Map<string,number>();
  for (const r of data ?? []) {
    const cat = (((r.payload as Record<string,unknown>)?.category as string) ?? "other").toLowerCase();
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  const total = Array.from(counts.values()).reduce((s,n)=>s+n,0) || 1;
  const rows = Object.entries(TARGET).map(([category, target]) => {
    const c = counts.get(category) ?? 0;
    const actual = c/total;
    const delta = actual - target;
    const rec = delta < -0.05 ? "boost" : delta > 0.05 ? "throttle" : "hold";
    return { category, window_start: window_start.toISOString(), exposure_count: c, target_share: target, actual_share: actual, delta, recommendation: rec };
  });
  const { error } = await sb.from("acos_diversity_state").insert(rows);
  if (error) return err(error.message);
  return ok({ categories: rows.length });
});
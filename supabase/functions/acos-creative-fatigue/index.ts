import { corsHeaders, requireAdmin, svc, ok, err, canRun } from "../_shared/acos-common.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const gate = await canRun("creative_fatigue"); if (!gate.allowed) return err(`gated: ${gate.reason}`, 423);
  const sb = svc();
  const { data: pins } = await sb.from("pinterest_publish_logs").select("created_at,payload").gte("created_at", new Date(Date.now()-7*86400000).toISOString()).limit(1000);
  const byFamily = new Map<string, number>();
  for (const p of pins ?? []) {
    const fam = ((p.payload as Record<string, unknown>)?.family as string) ?? "unknown";
    byFamily.set(fam, (byFamily.get(fam) ?? 0) + 1);
  }
  const total = Array.from(byFamily.values()).reduce((s,n)=>s+n,0) || 1;
  const rows: Array<Record<string,unknown>> = [];
  for (const [fam, n] of byFamily) {
    const share = n/total;
    if (share > 0.35) rows.push({ creative_ref: fam, family: fam, fatigue_score: share, signals: { share, count: n }, rotation_action: "rotate_to_other_family" });
  }
  if (rows.length) { const { error } = await sb.from("acos_creative_fatigue").insert(rows); if (error) return err(error.message); }
  return ok({ flagged: rows.length, total });
});
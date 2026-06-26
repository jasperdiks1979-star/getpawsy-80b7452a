import { corsHeaders, requireAdmin, svc, ok, err, canRun } from "../_shared/acos-common.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const gate = await canRun("video_expansion"); if (!gate.allowed) return err(`gated: ${gate.reason}`, 423);
  const body = await req.json().catch(()=>({})) as { product_ids?: string[] };
  const ids = body.product_ids ?? [];
  if (!ids.length) return err("product_ids required", 400);
  const sb = svc();
  const matrix: Array<[number,string]> = [[15,"portrait"],[30,"portrait"],[45,"portrait"],[60,"portrait"],[15,"square"],[30,"square"],[15,"landscape"],[30,"landscape"]];
  const rows = ids.flatMap((id)=>matrix.map(([d,ar])=>({ product_id: id, duration_sec: d, aspect_ratio: ar, voiceover: false, status: "queued" })));
  const { error } = await sb.from("acos_video_expansion_jobs").insert(rows);
  if (error) return err(error.message);
  return ok({ queued: rows.length });
});
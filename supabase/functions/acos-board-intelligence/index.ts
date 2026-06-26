import { corsHeaders, requireAdmin, svc, ok, err, canRun } from "../_shared/acos-common.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const gate = await canRun("board_intelligence"); if (!gate.allowed) return err(`gated: ${gate.reason}`, 423);
  const sb = svc();
  const { data: boards } = await sb.from("pinterest_boards").select("board_id, name").limit(200);
  const { data: perf } = await sb.from("pinterest_board_performance").select("board_id, ctr, saves, conversions").limit(2000);
  const aggr = new Map<string,{ctr:number;sav:number;conv:number;n:number}>();
  for (const r of perf ?? []) {
    const c = aggr.get(r.board_id) ?? { ctr:0, sav:0, conv:0, n:0 };
    c.ctr += Number(r.ctr ?? 0); c.sav += Number(r.saves ?? 0); c.conv += Number(r.conversions ?? 0); c.n += 1;
    aggr.set(r.board_id, c);
  }
  const rows = (boards ?? []).map((b) => {
    const a = aggr.get(b.board_id) ?? {ctr:0,sav:0,conv:0,n:0};
    const ctr = a.n ? a.ctr/a.n : 0;
    let suggestion = "keep";
    if (a.n === 0) suggestion = "archive_weak_board";
    else if (ctr < 0.002 && a.conv === 0) suggestion = "rename_or_merge";
    else if (ctr > 0.02) suggestion = "split_into_subtopics";
    return { board_id: b.board_id, board_name: b.name, ctr, saves: a.sav, traffic: 0, conversions: a.conv, frequency: a.n, diversity_score: 0, suggestion, detail: { samples: a.n } };
  });
  if (rows.length) { const { error } = await sb.from("acos_board_intelligence").insert(rows); if (error) return err(error.message); }
  return ok({ boards: rows.length });
});
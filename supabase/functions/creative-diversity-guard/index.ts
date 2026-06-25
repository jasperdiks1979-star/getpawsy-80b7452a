import { admin, cors, jsonResp, loadRules, checkCandidate } from "../_shared/creative-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = admin();
    const body = await req.json().catch(() => ({}));
    const cands: Candidate[] = body.candidates ?? [];
    const rules = await loadRules(sb);
    const out = [];
    for (const c of cands) out.push({ candidate: c, ...(await checkCandidate(sb, c, rules)) });
    return jsonResp({ ok: true, results: out });
  } catch (e) {
    return jsonResp({ ok: false, error: String(e) }, 500);
  }
});
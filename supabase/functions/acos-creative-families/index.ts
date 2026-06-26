import { corsHeaders, requireAdmin, svc, ok, err, canRun } from "../_shared/acos-common.ts";
const FAMILIES = ["luxury","minimal","lifestyle","funny","cute","emotional","problem_solution","ugc","pov","comparison","story","review","cinematic","macro","premium","before_after","seasonal","holiday","educational"];
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdmin(req); if (!auth.ok) return auth.res;
  const gate = await canRun("creative_families"); if (!gate.allowed) return err(`gated: ${gate.reason}`, 423);
  const sb = svc();
  const rows = FAMILIES.map((family) => ({
    family,
    brief: { tone: family, audience: "US pet parents", angles: [`${family} angle 1`, `${family} angle 2`] },
    visual_dna: { palette: [], lighting: family === "luxury" ? "soft golden" : "natural daylight", composition: "rule of thirds" },
    copy_dna: { hook_style: family, cta_style: family === "urgency" ? "act now" : "shop favorites" },
  }));
  const { data: existing } = await sb.from("acos_creative_families").select("family");
  const have = new Set((existing ?? []).map((r: { family: string }) => r.family));
  const fresh = rows.filter((r) => !have.has(r.family));
  if (fresh.length) { const { error } = await sb.from("acos_creative_families").insert(fresh); if (error) return err(error.message); }
  return ok({ inserted: fresh.length, total: rows.length });
});
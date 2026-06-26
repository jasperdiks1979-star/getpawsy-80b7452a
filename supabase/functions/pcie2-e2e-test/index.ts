// PCIE2 end-to-end test — selects 25 products across categories, runs the
// sole publisher in DRY-RUN, and returns aggregated pipeline traces.
// No Pinterest POST is performed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SAMPLE_SIZE = 50;
const CATEGORIES_MIN = 10;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Admin auth
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.replace("Bearer ", "");
  const isService = bearer && bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!isService) {
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await userClient.auth.getClaims(bearer);
    const uid = claims?.claims?.sub;
    if (!uid) return json({ ok: false, message: "unauthorized" }, 401);
    const { data: role } = await sb.from("user_roles").select("role").eq("user_id", uid).eq("role","admin").maybeSingle();
    if (!role) return json({ ok: false, message: "admin only" }, 403);
  }

  // Confirm legacy is neutralized
  const { data: inv } = await sb.from("pcie2_legacy_inventory")
    .select("category,name,neutralized,neutralized_via");
  const legacyActive = (inv ?? []).filter((r: any) => r.neutralized !== true);

  // Sample 25 products across functional classes from understanding table
  const { data: classes } = await sb.from("pcie2_product_understanding")
    .select("product_id,functional_class")
    .not("functional_class","is",null);
  const byClass = new Map<string, string[]>();
  for (const row of (classes ?? [])) {
    const k = row.functional_class as string;
    if (!byClass.has(k)) byClass.set(k, []);
    byClass.get(k)!.push(row.product_id);
  }
  // round-robin pick
  const picks: { product_id: string; functional_class: string }[] = [];
  const classList = Array.from(byClass.keys());
  let idx = 0;
  while (picks.length < SAMPLE_SIZE && classList.length) {
    const cls = classList[idx % classList.length];
    const arr = byClass.get(cls)!;
    if (arr.length) picks.push({ product_id: arr.shift()!, functional_class: cls });
    else classList.splice(idx % classList.length, 1);
    idx++;
    if (!classList.length) break;
  }

  // Invoke pcie2-publisher with dry-run for the batch
  const productIds = picks.map(p => p.product_id);
  const pubUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/pcie2-publisher`;
  const startedAt = Date.now();
  const res = await fetch(pubUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({ product_ids: productIds, force_live: false }),
  });
  const body = await res.json();
  const finishedAt = Date.now();

  // Per-pin pipeline trace evidence
  const results = (body?.results ?? []) as any[];
  const categories = Array.from(new Set(picks.map(p => p.functional_class)));
  const passedGates = results.flatMap(r => (r.traces ?? []).filter((t: any) => t.status === "passed"));
  const failedGates = results.flatMap(r => (r.traces ?? []).filter((t: any) => t.status === "failed"));

  return json({
    ok: true,
    pipeline: "pcie2_only",
    legacy_publishers_active: legacyActive.length,
    legacy_inventory: inv ?? [],
    sample_size: results.length,
    distinct_categories: categories.length,
    min_categories_required: CATEGORIES_MIN,
    duration_ms: finishedAt - startedAt,
    approved: results.filter(r => r.ok).length,
    rejected: results.filter(r => !r.ok).length,
    rejection_breakdown: failedGates.reduce((acc: Record<string, number>, t: any) => {
      const k = t.reject_reason || "other";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
    passed_modules: passedGates.length,
    failed_modules: failedGates.length,
    results,
    legacy_neutralization_confirmed: legacyActive.length === 0,
  });
});
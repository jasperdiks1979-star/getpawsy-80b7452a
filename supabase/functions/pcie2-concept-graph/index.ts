// PCIE2 Concept Graph — autonomous semantic branch builder.
// Actions:
//   {action:"seed"}   - ensures global root nodes (BRANCH_TYPES) + product roots
//   {action:"expand", node_id?, product_id?, count?:int} - asks AI for fresh children for a saturated node
//   {action:"saturation_report"} - returns saturation per node
// Server-side only. No publishing side effects.
import { createClient } from "npm:@supabase/supabase-js@2";
import { chatJson, embed, pgvector } from "../_shared/pcie2-ai.ts";
import { BRANCH_TYPES, CREATIVE_FAMILIES } from "../_shared/pcie2-engine-v2.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SUPA = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function seedGlobalRoots() {
  let created = 0;
  for (const bt of BRANCH_TYPES) {
    const { data: existing } = await SUPA.from("pcie2_concept_graph")
      .select("id").is("product_id", null).eq("scope", "global").eq("branch_type", bt).maybeSingle();
    if (existing) continue;
    const angle = `${bt.replace(/_/g, " ")} angle for pet products`;
    const [vec] = await embed([angle]);
    await SUPA.from("pcie2_concept_graph").insert({
      scope: "global", branch_type: bt, angle, depth: 0,
      embedding: vec ? pgvector(vec) : null,
      metadata: { canonical: true },
    });
    created++;
  }
  return created;
}

async function seedProductRoots(limit = 50) {
  // For each active product, ensure depth=0 nodes for the 40+ branch types exist (cheap, no AI calls)
  const { data: products } = await SUPA.from("products")
    .select("id,name,category")
    .eq("is_active", true)
    .limit(limit);
  let created = 0;
  for (const p of products ?? []) {
    const { data: existing } = await SUPA.from("pcie2_concept_graph")
      .select("branch_type").eq("product_id", p.id).eq("depth", 0);
    const have = new Set((existing ?? []).map((r: any) => r.branch_type));
    const rows = BRANCH_TYPES.filter((bt) => !have.has(bt)).map((bt) => ({
      product_id: p.id,
      scope: "product",
      branch_type: bt,
      angle: `${bt.replace(/_/g, " ")} angle for ${p.name}`,
      depth: 0,
      metadata: { product_name: p.name, category: p.category },
    }));
    if (rows.length) {
      const { error } = await SUPA.from("pcie2_concept_graph").insert(rows);
      if (!error) created += rows.length;
    }
  }
  return created;
}

async function expandNode(nodeId: string, count = 6) {
  const { data: node } = await SUPA.from("pcie2_concept_graph").select("*").eq("id", nodeId).maybeSingle();
  if (!node) return { ok: false, error: "node_missing" };
  let productCtx = "general pet ecommerce";
  if (node.product_id) {
    const { data: p } = await SUPA.from("products").select("name,category").eq("id", node.product_id).maybeSingle();
    if (p) productCtx = `"${p.name}" (category ${p.category ?? "pet"})`;
  }
  const system = "You are a semantic taxonomy expert for Pinterest commerce. Reply ONLY with JSON: {branches:[{angle:string,branch_type:string,family:string}]}";
  const families = CREATIVE_FAMILIES.map((f) => f.name).join(",");
  const prompt = `Parent angle: "${node.angle}" (branch_type=${node.branch_type}).
Product context: ${productCtx}.
Generate ${count} NEW child angles that are semantically distinct from the parent and from each other.
Each child must be a concrete content angle (not a generic theme). Pick family from: ${families}.
Avoid repeating these phrases verbatim. Use specific scenarios, audiences, or product moments.`;
  let out: any = { branches: [] };
  try { out = await chatJson({ prompt, system, temperature: 0.95 }); } catch (e) {
    return { ok: false, error: `ai_${(e as Error).message?.slice(0, 120)}` };
  }
  const branches = Array.isArray(out.branches) ? out.branches.slice(0, count) : [];
  if (!branches.length) return { ok: false, error: "no_branches" };
  const texts = branches.map((b: any) => String(b.angle || "").slice(0, 400));
  const vecs = await embed(texts).catch(() => [] as number[][]);
  const rows = branches.map((b: any, i: number) => ({
    parent_id: node.id,
    product_id: node.product_id,
    scope: node.scope,
    branch_type: String(b.branch_type || node.branch_type).slice(0, 64),
    family: String(b.family || "").slice(0, 64) || null,
    angle: String(b.angle || "").slice(0, 400),
    depth: (node.depth ?? 0) + 1,
    embedding: vecs[i] ? pgvector(vecs[i]) : null,
    metadata: { parent_angle: node.angle },
  })).filter((r: any) => r.angle);
  if (!rows.length) return { ok: false, error: "no_valid_rows" };
  const { error } = await SUPA.from("pcie2_concept_graph").insert(rows);
  await SUPA.from("pcie2_concept_graph").update({
    last_expanded_at: new Date().toISOString(),
    saturation_score: 0,
  }).eq("id", node.id);
  return { ok: !error, inserted: rows.length, error: error?.message };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "seed");
  try {
    if (action === "seed") {
      const global = await seedGlobalRoots();
      const product = await seedProductRoots(Number(body.product_limit ?? 50));
      const { count } = await SUPA.from("pcie2_concept_graph").select("*", { count: "exact", head: true });
      return Response.json({ ok: true, action, created_global: global, created_product: product, total_nodes: count });
    }
    if (action === "expand") {
      if (!body.node_id) {
        // Pick the most saturated leaf in scope
        const { data: candidates } = await SUPA.from("pcie2_concept_graph")
          .select("id,saturation_score,uses_count,last_expanded_at")
          .order("saturation_score", { ascending: false })
          .order("uses_count", { ascending: false })
          .limit(1);
        if (!candidates?.length) return Response.json({ ok: false, error: "no_candidates" });
        body.node_id = candidates[0].id;
      }
      const r = await expandNode(String(body.node_id), Number(body.count ?? 6));
      return Response.json({ ok: r.ok, action, ...r });
    }
    if (action === "saturation_report") {
      const { data } = await SUPA.from("pcie2_concept_graph")
        .select("branch_type, family, count:id.count(), avg_sat:saturation_score.avg()")
        .limit(100);
      return Response.json({ ok: true, rows: data ?? [] });
    }
    return Response.json({ ok: false, error: "unknown_action" }, { status: 400 });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
});

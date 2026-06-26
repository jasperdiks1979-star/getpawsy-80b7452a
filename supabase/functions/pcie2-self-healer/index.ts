// PCIE2 Self-Healer — detects creative library saturation and autonomously
// expands the concept graph + enqueues fresh (product, concept, family, visual_dna)
// jobs so the worker chain never runs out of net-new territory.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  CREATIVE_FAMILIES, BRANCH_TYPES, pickVisualDNA, fingerprintVisualDNA,
  ENGINE_V2,
} from "../_shared/pcie2-engine-v2.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SUPA = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function snapshotHealth() {
  const [creatives, queue, families, concepts, vdna, muts, rejs] = await Promise.all([
    SUPA.from("pcie2_creatives").select("*", { count: "exact", head: true }).eq("retired", false),
    SUPA.from("pcie2_creative_jobs").select("*", { count: "exact", head: true }).eq("status", "queued"),
    SUPA.from("pcie2_creative_families").select("*", { count: "exact", head: true }).eq("active", true),
    SUPA.from("pcie2_concept_graph").select("*", { count: "exact", head: true }),
    SUPA.from("pcie2_visual_dna").select("*", { count: "exact", head: true }),
    SUPA.from("pcie2_mutation_log").select("*", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 3600_000).toISOString()),
    SUPA.from("pcie2_creative_jobs").select("*", { count: "exact", head: true })
      .eq("status", "skipped").gte("updated_at", new Date(Date.now() - 3600_000).toISOString()),
  ]);
  const since5 = new Date(Date.now() - 5 * 60_000).toISOString();
  const { count: growth } = await SUPA.from("pcie2_creatives")
    .select("*", { count: "exact", head: true }).gte("created_at", since5);

  const snap = {
    creatives_total: creatives.count ?? 0,
    queue_depth: queue.count ?? 0,
    active_families: families.count ?? 0,
    active_concepts: concepts.count ?? 0,
    visual_fingerprints: vdna.count ?? 0,
    mutations_last_hour: muts.count ?? 0,
    rejections_last_hour: rejs.count ?? 0,
    growth_rate_5min: growth ?? 0,
    avg_similarity: 0,            // populated lazily; expensive to compute every run
    saturation_index: 0,
  };
  snap.saturation_index =
    (snap.growth_rate_5min < ENGINE_V2.SATURATION_GROWTH_PER_5MIN ? 0.6 : 0)
    + (snap.queue_depth === 0 ? 0.4 : 0);
  await SUPA.from("pcie2_engine_health").insert(snap);
  return snap;
}

async function enqueueFreshJobs(maxJobs: number) {
  // Pick up to N active products; pair each with a rotating family + fresh visual DNA + concept node
  const { data: products } = await SUPA.from("products")
    .select("id,name,category").eq("is_active", true).limit(200);
  if (!products?.length) return { enqueued: 0, reason: "no_products" };

  const { data: families } = await SUPA.from("pcie2_creative_families")
    .select("name,uses_count").eq("active", true).order("uses_count", { ascending: true }).limit(21);
  if (!families?.length) return { enqueued: 0, reason: "no_families" };

  const jobs: any[] = [];
  let seed = Date.now();
  for (const p of products) {
    if (jobs.length >= maxJobs) break;
    // Pick the least-used concept node for this product
    const { data: node } = await SUPA.from("pcie2_concept_graph")
      .select("id,angle,branch_type,family")
      .or(`product_id.eq.${p.id},product_id.is.null`)
      .order("uses_count", { ascending: true })
      .order("depth", { ascending: false })
      .limit(1).maybeSingle();
    if (!node) continue;
    const fam = families[(jobs.length) % families.length].name;
    const dna = pickVisualDNA(seed++);
    const fp = fingerprintVisualDNA(dna);
    // Skip if an existing creative for (product, concept, family, fingerprint) already exists
    const { data: dup } = await SUPA.from("pcie2_creatives")
      .select("id").eq("product_id", p.id).eq("concept", node.angle)
      .eq("family", fam).eq("visual_fingerprint", fp).eq("retired", false).maybeSingle();
    if (dup) continue;
    jobs.push({
      product_id: p.id,
      concept: node.angle,
      family: fam,
      visual_fingerprint: fp,
      concept_node_id: node.id,
      status: "queued",
    });
  }
  if (!jobs.length) return { enqueued: 0, reason: "all_combos_exist" };
  const { error, count } = await SUPA.from("pcie2_creative_jobs").insert(jobs, { count: "exact" });
  if (error) return { enqueued: 0, reason: `insert_error:${error.message}` };
  // Mark concept usage to avoid hammering the same node
  for (const j of jobs) {
    await SUPA.from("pcie2_concept_graph").update({
      uses_count: (1) as any, last_used_at: new Date().toISOString(),
    }).eq("id", j.concept_node_id);
  }
  return { enqueued: count ?? jobs.length };
}

function chain(name: string, payload: any) {
  const p = fetch(`${SUPA_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON}`, "apikey": ANON },
    body: JSON.stringify(payload),
  }).catch(() => {});
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(p); } catch { /* ignore */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({}));
  const snap = await snapshotHealth();

  const result: any = { snapshot: snap, actions: [] };

  if (snap.creatives_total >= ENGINE_V2.TARGET_CREATIVES) {
    chain("pcie2-step5-validate", { triggered_by: "self_healer_target_reached" });
    result.actions.push("target_reached_step5_triggered");
    return Response.json({ ok: true, ...result });
  }

  // Expand concept graph when growth stalls or queue empty
  const shouldExpand = body.force === true
    || snap.queue_depth === 0
    || snap.saturation_index >= 0.6;
  if (shouldExpand) {
    chain("pcie2-concept-graph", { action: "expand", count: 6 });
    result.actions.push("concept_expansion_dispatched");
  }

  // Always keep the worker fed: enqueue a fresh batch
  const target = Math.max(50, Math.min(400, snap.creatives_total < 1000 ? 200 : 80));
  const enq = await enqueueFreshJobs(target);
  result.actions.push(`enqueued_${enq.enqueued}`);
  if (enq.reason) result.reason = enq.reason;

  // Wake worker
  if (enq.enqueued > 0 || snap.queue_depth > 0) {
    chain("pcie2-creative-worker", { triggered_by: "self_healer" });
    result.actions.push("worker_kicked");
  }

  return Response.json({ ok: true, ...result });
});

// PCIE2 Step 5 Readiness Validation — runs ONLY after creative library exceeds 1000.
// Confirms gates without touching publishing. Writes a run record. Does NOT enable canary.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SUPA = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function count(table: string, filter?: (q: any) => any) {
  let q = SUPA.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: c } = await q;
  return c ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const gates: Record<string, any> = {};

  // Library size gates
  gates.creatives = { value: await count("pcie2_creatives", (q) => q.eq("retired", false)), min: 1000 };
  gates.headlines = { value: await count("pcie2_headline_library", (q) => q.eq("retired", false)), min: 500 };
  gates.hooks = { value: await count("pcie2_hook_library", (q) => q.eq("retired", false)), min: 500 };

  // Embedding coverage
  const { count: embedded } = await SUPA
    .from("pcie2_creatives").select("*", { count: "exact", head: true })
    .eq("retired", false).not("embedding", "is", null);
  gates.embedding_coverage = {
    value: embedded ?? 0, min: gates.creatives.value,
    note: "all retired=false creatives must have an embedding",
  };

  // Quality gate sample
  const { data: low } = await SUPA.from("pcie2_creatives")
    .select("id").eq("retired", false).lt("quality_score", 70).limit(1);
  gates.quality_min_70 = { value: low?.length ? "FAIL" : "PASS", min: "PASS" };

  // Safety locks
  const { data: cfg } = await SUPA.from("app_config")
    .select("key,value").in("key", ["pinterest_publishing_global_stop", "pcie2_publish_enabled"]);
  const cfgMap = Object.fromEntries((cfg ?? []).map((r: any) => [r.key, r.value]));
  gates.global_stop = { value: cfgMap.pinterest_publishing_global_stop, expected: true };
  gates.publish_disabled = { value: cfgMap.pcie2_publish_enabled, expected: false };

  // Queue drained?
  gates.jobs_queued = { value: await count("pcie2_creative_jobs", (q) => q.eq("status", "queued")), max: 0 };

  const passed =
    gates.creatives.value >= gates.creatives.min &&
    gates.headlines.value >= gates.headlines.min &&
    gates.hooks.value >= gates.hooks.min &&
    gates.embedding_coverage.value >= gates.embedding_coverage.min &&
    gates.quality_min_70.value === "PASS" &&
    String(gates.global_stop.value) === "true" &&
    String(gates.publish_disabled.value) === "false" &&
    gates.jobs_queued.value === 0;

  await SUPA.from("pcie2_runs").insert({
    run_type: "step5_readiness",
    status: passed ? "succeeded" : "failed",
    totals: { passed, gates },
    notes: passed ? "All Step 5 gates green. Awaiting explicit approval for Step 6." : "One or more Step 5 gates failed. Do NOT proceed.",
    finished_at: new Date().toISOString(),
  });

  return new Response(JSON.stringify({ ok: true, passed, gates, next: passed ? "AWAIT_USER_APPROVAL_FOR_STEP_6" : "REMEDIATE" }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
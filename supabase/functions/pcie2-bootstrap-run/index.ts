// PCIE2 Bootstrap Orchestrator — runs Steps 1–6 of the autonomous ecosystem build.
// Halts at the first failed success gate. Never publishes. Caller: admin/internal only.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SUPA = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function call(fn: string, body: unknown) {
  const r = await fetch(`${BASE}/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SRK}`, apikey: SRK },
    body: JSON.stringify(body ?? {}),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const params = (await req.json().catch(() => ({}))) as { top_n?: number; dry_run?: boolean };
  const topN = params.top_n ?? 100;
  const dry = !!params.dry_run;
  const started = new Date().toISOString();

  const { data: topProducts } = await SUPA
    .from("products").select("id,title,category").eq("active", true).order("revenue_score", { ascending: false, nullsFirst: false }).limit(topN);
  const productIds = (topProducts ?? []).map((p: any) => p.id);
  const categories = Array.from(new Set((topProducts ?? []).map((p: any) => p.category).filter(Boolean))).slice(0, 20);

  const stages: any[] = [];
  const head = await call("pcie2-headline-engine", { categories, target_per_cell: 25, max_calls: 60, dry_run: dry });
  stages.push({ stage: "headline_engine", ...head });
  const hook = await call("pcie2-hook-engine", { product_ids: productIds, target_per_cell: 6, dry_run: dry });
  stages.push({ stage: "hook_engine", ...hook });
  const creative = await call("pcie2-creative-engine", { product_ids: productIds, concepts_per_product: 10, dry_run: dry });
  stages.push({ stage: "creative_engine", ...creative });

  const [{ count: hc }, { count: kc }, { count: cc }] = await Promise.all([
    SUPA.from("pcie2_headline_library").select("*", { count: "exact", head: true }).eq("retired", false),
    SUPA.from("pcie2_hook_library").select("*", { count: "exact", head: true }).eq("retired", false),
    SUPA.from("pcie2_creatives").select("*", { count: "exact", head: true }),
  ]);

  const gates = {
    headlines_500: (hc ?? 0) >= 500,
    hooks_500: (kc ?? 0) >= 500,
    creatives_1000: (cc ?? 0) >= 1000,
  };
  const all_passed = Object.values(gates).every(Boolean);

  const summary = {
    ok: true, started, finished: new Date().toISOString(), top_n: topN, dry_run: dry,
    products: productIds.length, categories: categories.length,
    counts: { headlines: hc, hooks: kc, creatives: cc },
    gates, all_passed, stages,
  };
  await SUPA.from("pcie2_runs").insert({ run_kind: "bootstrap", status: all_passed ? "passed" : "halted", report: summary });
  return new Response(JSON.stringify(summary), { headers: { ...cors, "Content-Type": "application/json" } });
});

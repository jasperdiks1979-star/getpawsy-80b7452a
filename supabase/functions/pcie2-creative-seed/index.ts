// PCIE2 Creative Seeder — enqueues (product, concept) jobs for all active products.
// Idempotent: ON CONFLICT DO NOTHING. Does NOT trigger workers.
import { createClient } from "npm:@supabase/supabase-js@2";
import { CREATIVE_CONCEPTS } from "../_shared/pcie2-ai.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const SUPA = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = await req.json().catch(() => ({} as any));
  const concepts: string[] = body.concepts ?? [...CREATIVE_CONCEPTS];

  const { data, error } = await SUPA.rpc("pcie2_enqueue_creative_jobs", { p_concepts: concepts });
  if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });

  const [{ count: queued }, { count: total }, { count: creatives }] = await Promise.all([
    SUPA.from("pcie2_creative_jobs").select("*", { count: "exact", head: true }).eq("status", "queued"),
    SUPA.from("pcie2_creative_jobs").select("*", { count: "exact", head: true }),
    SUPA.from("pcie2_creatives").select("*", { count: "exact", head: true }).eq("retired", false),
  ]);

  return new Response(JSON.stringify({ ok: true, inserted: data ?? 0, queued, total_jobs: total, creatives, concepts }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
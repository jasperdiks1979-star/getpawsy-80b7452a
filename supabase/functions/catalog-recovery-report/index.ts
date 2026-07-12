import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const [
    { count: total }, { count: mapped },
    { count: skuIssues }, { data: byMethod },
    { count: pendingBatches }, { count: doneBatches }, { count: pausedBatches },
    { count: invSynced },
  ] = await Promise.all([
    s.from("catalog_recovery_index").select("*", { count: "exact", head: true }),
    s.from("catalog_recovery_mappings").select("*", { count: "exact", head: true }),
    s.from("catalog_recovery_sku_issues").select("*", { count: "exact", head: true }),
    s.from("catalog_recovery_mappings").select("method"),
    s.from("catalog_recovery_batches").select("*", { count: "exact", head: true }).eq("status", "pending"),
    s.from("catalog_recovery_batches").select("*", { count: "exact", head: true }).eq("status", "done"),
    s.from("catalog_recovery_batches").select("*", { count: "exact", head: true }).eq("status", "paused_credits"),
    s.from("catalog_recovery_mappings").select("*", { count: "exact", head: true }).not("inventory_synced_at", "is", null),
  ]);

  const methodCounts: Record<string, number> = {};
  (byMethod ?? []).forEach((r: any) => { methodCounts[r.method] = (methodCounts[r.method] ?? 0) + 1; });

  const recoveryPct = total ? Math.round(((mapped ?? 0) / total) * 100) : 0;
  const inventoryPct = mapped ? Math.round(((invSynced ?? 0) / mapped) * 100) : 0;

  return new Response(JSON.stringify({
    ok: true,
    total_variants: total ?? 0,
    mapped: mapped ?? 0,
    unmapped: (total ?? 0) - (mapped ?? 0),
    sku_issues: skuIssues ?? 0,
    method_counts: methodCounts,
    batches: { pending: pendingBatches ?? 0, done: doneBatches ?? 0, paused_credits: pausedBatches ?? 0 },
    inventory_synced: invSynced ?? 0,
    scores: {
      recovery_pct: recoveryPct,
      fulfillment_pct: recoveryPct,
      inventory_pct: inventoryPct,
      commerce_pct: Math.min(recoveryPct, inventoryPct),
    },
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
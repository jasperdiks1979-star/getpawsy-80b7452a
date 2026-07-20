import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assessProductEligibility } from "../_shared/pinterest-eligibility.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const stats = { ineligible_removed: 0, duplicates_removed: 0, broken_url_removed: 0 };

  // 1. Ineligible products in pin/video queues
  for (const table of ["pinterest_pin_queue", "pinterest_video_queue"]) {
    const { data: rows } = await sb.from(table).select("id, product_id").in("status", ["pending", "ready", "scheduled"]).limit(1000);
    for (const row of rows ?? []) {
      if (!row.product_id) continue;
      const res = await assessProductEligibility(row.product_id, { sourceLabel: `cleanup_${table}` });
      if (!res.eligible) {
        await sb.from(table).update({ status: "ineligible", error_message: `cleanup:${res.reason}` }).eq("id", row.id);
        stats.ineligible_removed++;
      }
    }
  }

  // 2. Duplicate dest URLs (last 7d, keep most recent)
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: dups } = await sb
    .from("pinterest_video_queue")
    .select("id, destination_url, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  const seen = new Set<string>();
  for (const row of dups ?? []) {
    if (!row.destination_url) continue;
    if (seen.has(row.destination_url)) {
      await sb.from("pinterest_video_queue").update({ status: "duplicate" }).eq("id", row.id);
      stats.duplicates_removed++;
    } else {
      seen.add(row.destination_url);
    }
  }

  return new Response(JSON.stringify({ ok: true, stats }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
// pinterest-pipeline-drain — REMOVED (P0 architecture remediation 2026-06-26).
//
// Replaced by canonical pipeline: pcie2_publish_queue → pcie2-publisher.
// This stub hard-denies every request and logs to guardian_publish_gate_log.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const caller = req.headers.get("x-caller") ?? req.headers.get("user-agent") ?? "unknown";
    await sb.from("guardian_publish_gate_log").insert({
      pipeline: "pinterest-pipeline-drain",
      decision: "deny",
      reason: "chained_bypass_removed",
      guardian_color: "red",
      guardian_score: 0,
      meta: { caller },
    });
  } catch (_) { /* swallow */ }
  return new Response(
    JSON.stringify({
      ok: false,
      code: "publisher_removed",
      message: "pinterest-pipeline-drain has been retired. Enqueue into pcie2_publish_queue; pcie2-publisher is the only canonical Pinterest publisher.",
      canonical: { queue: "pcie2_publish_queue", publisher: "pcie2-publisher" },
    }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

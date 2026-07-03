// LEGACY REMOVED (PCIE2 Wave 4 — sole-publisher enforcement).
// The previous 3851-line publisher was deleted on 2026-06-26. PCIE2 is now the
// only allowed Pinterest publishing pipeline. This stub returns 410 Gone so any
// stale cron, dispatcher, or admin button fails loudly instead of silently
// republishing legacy content. Do NOT re-enable. See:
//   - supabase/functions/pcie2-publisher/index.ts (sole publisher)
//   - supabase/functions/_shared/pcie2-publish-lock.ts (kill switch)
//   - scripts/pcie2-legacy-guard.mjs (deploy-time guard)
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  return new Response(JSON.stringify({
    ok: false,
    blocked: true,
    code: "LEGACY_PUBLISHER_REMOVED",
    error: "pinterest-automation has been physically removed. PCIE2 is the only allowed publishing pipeline. Use pcie2-publisher.",
    sole_publisher: "pcie2-publisher",
    removed_at: "2026-06-26",
    // Return 200 so supabase.functions.invoke() delivers this structured body
    // to callers instead of throwing an opaque "non-2xx status code" error.
    // The publish pipeline remains blocked by the `blocked:true` flag above and
    // by scripts/pcie2-legacy-guard.mjs at deploy time. Do NOT re-enable logic.
  }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
});

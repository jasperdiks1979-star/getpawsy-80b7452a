// LEGACY REMOVED (PCIE2 Wave 4 — sole-publisher enforcement).
// The previous replacement-draft publisher was deleted on 2026-06-26 because it
// POSTed /v5/pins and bypassed PCIE2 quality gates. Live pin repair is now done
// via PATCH-only flows that do not create new pins. PCIE2 is the only allowed
// pipeline to POST /v5/pins.
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
    error: "pinterest-live-pin-repair-execute has been physically removed. Use pcie2-publisher.",
    sole_publisher: "pcie2-publisher",
    removed_at: "2026-06-26",
  }), { status: 410, headers: { ...cors, "Content-Type": "application/json" } });
});

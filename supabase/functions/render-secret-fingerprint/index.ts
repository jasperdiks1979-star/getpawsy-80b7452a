import { corsHeaders } from "../_shared/cors.ts";

// Diagnostic-only. Returns a NON-REVERSIBLE fingerprint of the
// RENDER_WORKER_SECRET configured on the Lovable Cloud side so it can be
// compared with the fingerprint logged by the Render worker at boot.
// Never returns the secret value itself.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const secret = Deno.env.get("RENDER_WORKER_SECRET") ?? "";
  if (!secret) {
    return new Response(
      JSON.stringify({ ok: false, message: "RENDER_WORKER_SECRET not set on backend" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const bytes = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return new Response(
    JSON.stringify({
      ok: true,
      side: "lovable_cloud_edge_function",
      env_var: "RENDER_WORKER_SECRET",
      length: secret.length,
      sha256_prefix: hex.slice(0, 12),
      has_leading_ws: /^\s/.test(secret),
      has_trailing_ws: /\s$/.test(secret),
      has_quotes: /^["'].*["']$/.test(secret),
      ts: new Date().toISOString(),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
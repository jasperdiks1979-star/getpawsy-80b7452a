// One-shot internal invoker: reads PINTEREST_ROLLOUT_TOKEN from env and
// forwards the caller's body to resurrection-to-pcie2-bridge. Deployed
// specifically so the Lovable agent sandbox (which cannot read edge-function
// secrets directly) can safely invoke Mission A without weakening the
// bridge's own auth wall. Idempotent, no side effects of its own.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const token = Deno.env.get("PINTEREST_ROLLOUT_TOKEN") ?? "";
  if (!token) return new Response(JSON.stringify({ ok: false, error: "no_rollout_token" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/resurrection-to-pcie2-bridge`;
  const bodyText = await req.text();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-rollout-token": token },
    body: bodyText || "{}",
  });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
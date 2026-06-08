// One-shot bootstrap invoker for pinterest-integrity-audit.
// Calls the audit function with the project's INTERNAL_FUNCTION_SECRET so the
// admin agent can trigger a full audit + auto-repair without a user JWT.
// Safe because the secret is only readable inside the project's edge runtime.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const INTERNAL = Deno.env.get("INTERNAL_FUNCTION_SECRET") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "all";
  const autorepair = url.searchParams.get("autorepair") || "true";
  const batch = url.searchParams.get("batch_size") || "1000";

  const r = await fetch(`${SUPABASE_URL}/functions/v1/pinterest-integrity-audit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": INTERNAL,
    },
    body: JSON.stringify({ mode, autorepair: autorepair === "true", batch_size: Number(batch) }),
  });
  const text = await r.text();
  return new Response(text, {
    status: r.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
// Admin-only one-shot endpoint that synchronizes pinterest_pin_queue with
// the result of the Pinterest Zero-Cleanup verification pass.
// Accepts { clear_ids: string[], verify_ids: string[] }.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const adminSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    const provided = req.headers.get("x-admin-secret");
    if (!adminSecret || provided !== adminSecret) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
    }
    const { clear_ids = [], verify_ids = [] } = await req.json();
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const out: Record<string, number> = { clear_updated: 0, verify_updated: 0 };
    // process in chunks of 100 for safety
    for (let i = 0; i < clear_ids.length; i += 100) {
      const chunk = clear_ids.slice(i, i + 100);
      const { data, error } = await supa
        .from("pinterest_pin_queue")
        .update({
          pinterest_pin_id: null,
          rejection_reason: "zero_cleanup_2026_06_26",
          updated_at: new Date().toISOString(),
        })
        .in("id", chunk)
        .select("id");
      if (error) throw error;
      out.clear_updated += data?.length ?? 0;
      // bump to rejected only if still in active states
      await supa
        .from("pinterest_pin_queue")
        .update({ status: "rejected" })
        .in("id", chunk)
        .in("status", ["posted", "published", "paused", "queued", "draft"]);
    }
    for (let i = 0; i < verify_ids.length; i += 100) {
      const chunk = verify_ids.slice(i, i + 100);
      const { data, error } = await supa
        .from("pinterest_pin_queue")
        .update({
          live_pin_verified_at: new Date().toISOString(),
          pin_verified: true,
          pin_verification_reason: "zero_cleanup_verified",
          updated_at: new Date().toISOString(),
        })
        .in("id", chunk)
        .select("id");
      if (error) throw error;
      out.verify_updated += data?.length ?? 0;
    }
    return new Response(JSON.stringify({ ok: true, ...out }), { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: cors });
  }
});
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // One-off internal backfill endpoint. Will be deleted after run.
    const body = await req.json();
    const updates: Array<{ id: string; t: string; d: string }> = body.updates || [];
    if (!Array.isArray(updates) || updates.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "no updates" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let ok = 0, fail = 0;
    const errors: string[] = [];
    // Chunk to keep individual requests bounded
    const chunk = 50;
    for (let i = 0; i < updates.length; i += chunk) {
      const batch = updates.slice(i, i + chunk);
      await Promise.all(batch.map(async (u) => {
        const { error } = await supabase
          .from("products")
          .update({ seo_title: u.t, seo_meta_description: u.d, updated_at: new Date().toISOString() })
          .eq("id", u.id);
        if (error) { fail++; if (errors.length < 5) errors.push(error.message); } else ok++;
      }));
    }
    return new Response(JSON.stringify({ ok: true, updated: ok, failed: fail, errors }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
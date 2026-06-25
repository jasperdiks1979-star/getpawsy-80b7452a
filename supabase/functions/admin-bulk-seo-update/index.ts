import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Require admin JWT — this endpoint mutates product data with the service role.
    const SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    const internalOk = !!SECRET && req.headers.get("x-internal-secret") === SECRET;
    if (!internalOk) {
      const token = req.headers.get("Authorization")?.replace("Bearer ", "");
      if (!token) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
      }
      const { data: userData } = await supabase.auth.getUser(token);
      const user = userData?.user;
      if (!user) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
      }
      const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!role) {
        return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "content-type": "application/json" } });
      }
    }

    const body = await req.json();
    const updates: Array<Record<string, any>> = body.updates || [];
    const mode: string = body.mode || "seo"; // "seo" | "v2"
    if (!Array.isArray(updates) || updates.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "no updates" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }
    let ok = 0, fail = 0;
    const errors: string[] = [];
    // Chunk to keep individual requests bounded
    const chunk = 50;
    for (let i = 0; i < updates.length; i += chunk) {
      const batch = updates.slice(i, i + chunk);
      await Promise.all(batch.map(async (u) => {
        let payload: Record<string, any> = {};
        if (mode === "seo") {
          payload = { seo_title: u.t, seo_meta_description: u.d, updated_at: new Date().toISOString() };
        } else if (mode === "v2") {
          payload = {
            revenue_priority_score_v2: u.score,
            revenue_tier: u.tier,
            score_components_v2: u.components,
            revenue_priority_v2_updated_at: new Date().toISOString(),
          };
        }
        const { error } = await supabase.from("products").update(payload).eq("id", u.id);
        if (error) { fail++; if (errors.length < 5) errors.push(error.message); } else ok++;
      }));
    }
    return new Response(JSON.stringify({ ok: true, updated: ok, failed: fail, errors }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
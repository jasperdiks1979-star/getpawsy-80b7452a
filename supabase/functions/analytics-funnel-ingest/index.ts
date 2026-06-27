import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const STEPS = [
  "click","redirect","landing","engagement_start","page_view","scroll",
  "view_item","add_to_cart","view_cart","remove_from_cart","begin_checkout","payment","purchase",
] as const;
type Step = typeof STEPS[number];

const COL: Record<Step,string> = {
  click:"click_at", redirect:"redirect_at", landing:"landing_at",
  engagement_start:"engagement_start_at", page_view:"page_view_at",
  scroll:"scroll_at", view_item:"view_item_at", add_to_cart:"add_to_cart_at",
  view_cart:"view_cart_at", remove_from_cart:"remove_from_cart_at",
  begin_checkout:"begin_checkout_at", payment:"payment_at", purchase:"purchase_at",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const session_id = String(body.session_id || "").slice(0, 128);
    const step = String(body.step || "") as Step;
    if (!session_id || !STEPS.includes(step)) {
      return new Response(JSON.stringify({ ok: false, error: "bad input" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      session_id,
      [COL[step]]: now,
      furthest_step: step,
      updated_at: now,
    };
    if (body.visitor_id) patch.visitor_id = body.visitor_id;
    if (body.utm_source) patch.utm_source = body.utm_source;
    if (body.utm_medium) patch.utm_medium = body.utm_medium;
    if (body.utm_campaign) patch.utm_campaign = body.utm_campaign;
    if (body.landing_page) patch.landing_page = body.landing_page;
    if (body.traffic_type) patch.traffic_type = body.traffic_type;
    await admin.from("analytics_funnel_waterfall").upsert(patch, { onConflict: "session_id" });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
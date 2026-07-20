import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_STAGES = new Set([
  "pin_impression","pin_click","landing","product_view","gallery_interact",
  "variant_select","scroll_depth","video_interact","add_to_cart","cart_view",
  "coupon_use","shipping_calc","checkout_start","contact_info","shipping_method",
  "payment_method","payment_attempt","payment_success","order_created","purchase",
  "upsell","repeat_purchase",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    if (!body?.session_id || !body?.stage || !ALLOWED_STAGES.has(body.stage)) {
      return new Response(JSON.stringify({ ok: false, error: "invalid_event" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const row = {
      event_id: body.event_id ?? null,
      session_id: String(body.session_id).slice(0, 128),
      visitor_id: body.visitor_id ? String(body.visitor_id).slice(0, 128) : null,
      stage: body.stage,
      ts: body.ts ? new Date(body.ts).toISOString() : new Date().toISOString(),
      product_id: body.product_id ?? null,
      source: body.source ?? null,
      campaign: body.campaign ?? null,
      creative_id: body.creative_id ?? null,
      pin_id: body.pin_id ?? null,
      tiktok_video_id: body.tiktok_video_id ?? null,
      device: body.device ?? null,
      country: body.country ?? null,
      value_cents: typeof body.value_cents === "number" ? body.value_cents : null,
      currency: body.currency ?? "USD",
      meta: body.meta ?? {},
    };
    const { error } = await supabase.from("arie_funnel_events").upsert(row, {
      onConflict: "event_id", ignoreDuplicates: true,
    });
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
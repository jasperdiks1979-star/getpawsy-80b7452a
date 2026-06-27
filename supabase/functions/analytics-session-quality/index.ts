import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

// Deterministic scorer: returns 0..100 + classification.
function score(s: any): { score: number; cls: string } {
  const t = Math.min(120, Math.max(0, Number(s.time_on_page_ms || 0) / 1000)); // 0..120s
  const scroll = Math.min(100, Number(s.max_scroll_pct || 0));
  const inter = Number(s.mouse_events||0) + Number(s.touch_events||0);
  const prod = Number(s.product_interactions||0);
  const cart = Number(s.cart_interactions||0);
  const co = Number(s.checkout_interactions||0);
  const pages = Number(s.page_count||1);

  let sc = 0;
  sc += Math.min(20, t / 6); // up to 20 for time
  sc += Math.min(15, scroll * 0.15);
  sc += Math.min(10, inter * 0.5);
  sc += Math.min(15, prod * 5);
  sc += Math.min(15, cart * 15);
  sc += Math.min(20, co * 20);
  sc += Math.min(5, (pages - 1) * 2);
  sc = Math.max(0, Math.min(100, Math.round(sc)));

  let cls = "Bounce";
  if (inter === 0 && t < 3) cls = "Bot";
  else if (t < 5) cls = "Accidental";
  else if (sc >= 80) cls = "Buyer";
  else if (sc >= 60) cls = "HighIntent";
  else if (sc >= 40) cls = "Shopping";
  else if (sc >= 20) cls = "Interested";
  else cls = "Bounce";
  if (co > 0) cls = "Buyer";
  return { score: sc, cls };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const session_id = String(body.session_id || "").slice(0,128);
    if (!session_id) {
      return new Response(JSON.stringify({ ok: false, error: "missing session_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { score: sc, cls } = score(body);
    await admin.from("analytics_session_quality").upsert({
      session_id,
      visitor_id: body.visitor_id ?? null,
      score: sc,
      classification: cls,
      time_on_page_ms: body.time_on_page_ms ?? 0,
      max_scroll_pct: body.max_scroll_pct ?? 0,
      mouse_events: body.mouse_events ?? 0,
      touch_events: body.touch_events ?? 0,
      product_interactions: body.product_interactions ?? 0,
      cart_interactions: body.cart_interactions ?? 0,
      checkout_interactions: body.checkout_interactions ?? 0,
      visible_ratio: body.visible_ratio ?? 0,
      page_count: body.page_count ?? 1,
      return_visit: !!body.return_visit,
      signals: body.signals ?? {},
      updated_at: new Date().toISOString(),
    }, { onConflict: "session_id" });
    return new Response(JSON.stringify({ ok: true, score: sc, classification: cls }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
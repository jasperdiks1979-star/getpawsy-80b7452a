/**
 * pinterest-landing-resolver
 *
 * Returns the composed payload for /go/:slug — used by the React landing page.
 * Public read, no auth. Read-only against pinterest_landing_templates and the
 * products_public view.
 *
 * Standard JSON envelope: { ok, traceId, message?, data? }.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function traceId() {
  return crypto.randomUUID();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const tid = traceId();

  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();
    const hookOverride = url.searchParams.get("hook")?.trim() || null;
    const intentOverride = url.searchParams.get("intent")?.trim() || null;
    const pinModeOverride = url.searchParams.get("pin_mode")?.trim() || null;

    if (!slug || !/^[a-z0-9-]{2,64}$/.test(slug)) {
      return json({ ok: false, traceId: tid, message: "invalid_slug" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data: tmpl, error } = await supabase
      .from("pinterest_landing_templates")
      .select("*")
      .eq("slug", slug)
      .eq("enabled", true)
      .maybeSingle();

    if (error) {
      console.error("[landing-resolver] db error", tid, error);
      return json({ ok: false, traceId: tid, message: "db_error" }, 500);
    }
    if (!tmpl) {
      return json({ ok: false, traceId: tid, message: "not_found" }, 404);
    }

    // Resolve recommended product (single) or up to 6 from the collection.
    let products: Array<Record<string, unknown>> = [];
    if (tmpl.recommended_product_slug) {
      const { data: p } = await supabase
        .from("products_public")
        .select("id, slug, name, price, compare_at_price, image_url, category, rating, review_count")
        .eq("slug", tmpl.recommended_product_slug)
        .maybeSingle();
      if (p) products.push(p as Record<string, unknown>);
    }
    if (products.length < 4 && tmpl.recommended_collection_slug) {
      const { data: list } = await supabase
        .from("products_public")
        .select("id, slug, name, price, compare_at_price, image_url, category, rating, review_count")
        .or(`category.eq.${tmpl.recommended_collection_slug},category.ilike.%${tmpl.recommended_collection_slug}%`)
        .limit(6);
      if (list?.length) {
        const seen = new Set(products.map((x) => String(x.slug)));
        for (const row of list) {
          if (!seen.has(String((row as Record<string, unknown>).slug))) {
            products.push(row as Record<string, unknown>);
          }
        }
      }
    }

    return json({
      ok: true,
      traceId: tid,
      data: {
        template: {
          ...tmpl,
          // Allow pin-level override of hook/intent so copy can flex.
          hook_type: hookOverride || tmpl.hook_type,
          emotional_angle: intentOverride || tmpl.emotional_angle,
          pin_mode: pinModeOverride || tmpl.pin_mode,
        },
        products: products.slice(0, 6),
      },
    });
  } catch (e) {
    console.error("[landing-resolver] unhandled", tid, e);
    return json(
      { ok: false, traceId: tid, message: e instanceof Error ? e.message : "unknown" },
      500,
    );
  }
});
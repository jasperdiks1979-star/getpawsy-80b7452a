/**
 * resolve-product-slug — public resolver endpoint for client-side PDP
 * fallback. When /products/{dead-slug} does not match an active product,
 * the React PDP calls this function to discover the live replacement
 * (slug history -> alias -> sku -> cj_map -> similar). Returns JSON.
 *
 * GET ?slug=foo  ->  { ok, step, product_slug, product_id, target, reason }
 * No auth: this only exposes public catalog metadata via the shared
 * resolver ladder. Always preserves UTM by letting the client append
 * window.location.search to the returned slug.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.0";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveDestination } from "../_shared/pinterest-url-resolver.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const traceId = crypto.randomUUID().slice(0, 8);
  const url = new URL(req.url);
  let slug = url.searchParams.get("slug") || "";
  if (!slug && (req.method === "POST")) {
    try {
      const body = await req.json();
      slug = String(body?.slug || "").trim();
    } catch { /* ignore */ }
  }
  slug = slug.toLowerCase().replace(/^\/+|\/+$/g, "");
  if (!slug) {
    return new Response(
      JSON.stringify({ ok: false, traceId, message: "missing_slug" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const result = await resolveDestination(sb, `https://getpawsy.pet/products/${slug}`);
  return new Response(
    JSON.stringify({
      ok: result.ok,
      traceId,
      step: result.step,
      product_slug: result.product_slug,
      product_id: result.product_id,
      category: result.category,
      target: result.target,
      reason: result.reason ?? null,
    }),
    {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      },
    },
  );
});
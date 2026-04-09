import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2?target=deno";

const ALLOWED_ORIGINS = [
  "https://getpawsy.pet",
  "https://www.getpawsy.pet",
  "https://getpawsy.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, cache-control",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch active products with images and stock
    const { data: products, error } = await sb
      .from("products")
      .select("id, name, slug, description, price, compare_at_price, category, image_url, stock, cost_price")
      .eq("is_active", true)
      .gt("stock", 0)
      .not("image_url", "is", null)
      .not("slug", "is", null)
      .gt("price", 0)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const BASE_URL = "https://getpawsy.pet";
    const LITTER_BOX_KEYWORDS = ["litter box", "litter-box", "cat litter"];

    const feed = (products || []).map((p) => {
      const name = (p.name || "").toLowerCase();
      const isLitterBox = LITTER_BOX_KEYWORDS.some((kw) => name.includes(kw));
      const margin = p.cost_price && p.price > p.cost_price
        ? (p.price - p.cost_price) / p.price
        : 0.3;

      let priority: "high" | "medium" | "low" = "medium";
      if (isLitterBox || margin > 0.5) priority = "high";
      else if (margin < 0.15 || p.price < 10) priority = "low";

      return {
        id: p.id,
        title: p.name,
        description: (p.description || "").slice(0, 300),
        product_url: `${BASE_URL}/products/${p.slug}`,
        landing_page_url: `${BASE_URL}/products/${p.slug}`,
        image_url: p.image_url,
        category: p.category || "Pet Products",
        slug: p.slug,
        price: p.price,
        priority,
      };
    });

    // Sort: high first, then medium, then low
    const order = { high: 0, medium: 1, low: 2 };
    feed.sort((a, b) => order[a.priority] - order[b.priority]);

    return new Response(JSON.stringify(feed), {
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    });
  } catch (e) {
    console.error("pinterest-feed error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});

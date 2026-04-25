import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "opportunities";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    if (action === "opportunities") {
      return await handleOpportunities(supabase);
    }
    if (action === "insights") {
      return await handleInsights(supabase);
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("revenue-accelerator error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ─── /api/product-opportunities ──────────────────────────
async function handleOpportunities(supabase: any) {
  // Top products by margin potential
  const { data: products } = await supabase
    .from("products")
    .select("id, name, slug, price, compare_at_price, image_url, category, stock, is_active")
    .eq("is_active", true)
    .gt("stock", 0)
    .order("price", { ascending: false })
    .limit(100);

  const scored = (products ?? []).map((p: any) => {
    let score = 0;
    // Price sweet spot
    if (p.price >= 15 && p.price <= 50) score += 3;
    else if (p.price > 50 && p.price <= 80) score += 2;
    // Margin signal
    if (p.compare_at_price && p.compare_at_price > p.price) {
      score += Math.min(3, Math.round(((p.compare_at_price - p.price) / p.compare_at_price) * 10));
    }
    // Image present
    if (p.image_url && p.image_url.length > 10) score += 2;
    // Visual/high-demand category
    const cat = (p.category || "").toLowerCase();
    if (/toy|feeder|carrier|training|harness|leash/.test(cat)) score += 2;
    // Stock health
    if (p.stock > 20) score += 1;
    return { ...p, score };
  });

  scored.sort((a: any, b: any) => b.score - a.score);
  const topProducts = scored.slice(0, 20);

  // SEO keyword suggestions based on top categories
  const categories = [...new Set(topProducts.map((p: any) => p.category).filter(Boolean))] as string[];
  const seoKeywords = categories.flatMap((cat) => {
    const c = cat.toLowerCase();
    if (c.includes("cat")) return [`best ${c} 2026`, `${c} for indoor cats`, `top rated ${c}`];
    if (c.includes("dog")) return [`best ${c} 2026`, `${c} for large dogs`, `top ${c} for puppies`];
    return [`best ${c} 2026`, `top rated ${c}`];
  });

  // Title suggestions
  const titleSuggestions = topProducts.slice(0, 10).map((p: any) => {
    const cat = (p.category || "Pet Product").replace(/^[a-z]/, (m: string) => m.toUpperCase());
    const petType = /cat/i.test(p.category || "") ? "for Cats" : /dog/i.test(p.category || "") ? "for Dogs" : "for Pets";
    const base = p.name.replace(/[–—-]\s*.*/g, "").trim();
    const optimized = `${base} – Premium ${cat} ${petType}`.slice(0, 150);
    return { productId: p.id, original: p.name, optimized };
  });

  // Guide ideas
  const guideIdeas = categories.slice(0, 5).map((cat) => ({
    topic: `Best ${cat} in 2026 – Complete Buying Guide`,
    targetKeyword: `best ${cat.toLowerCase()} 2026`,
    estimatedWords: 1200,
    internalLinkTarget: `/collections/${cat.toLowerCase().replace(/\s+/g, "-")}`,
  }));

  return json({
    topProducts: topProducts.map((p: any) => ({ id: p.id, name: p.name, slug: p.slug, price: p.price, score: p.score, category: p.category })),
    seoKeywords: [...new Set(seoKeywords)],
    titleSuggestions,
    guideIdeas,
  });
}

// ─── /api/revenue-insights ──────────────────────────────
async function handleInsights(supabase: any) {
  // Top products by order volume
  const { data: recentOrders } = await supabase
    .from("order_items")
    .select("product_id, quantity, price_at_time, orders!inner(created_at)")
    .gte("orders.created_at", new Date(Date.now() - 30 * 86400000).toISOString())
    .limit(500);

  const productSales: Record<string, { revenue: number; units: number }> = {};
  for (const item of recentOrders ?? []) {
    const id = item.product_id;
    if (!productSales[id]) productSales[id] = { revenue: 0, units: 0 };
    productSales[id].revenue += (item.price_at_time ?? 0) * (item.quantity ?? 1);
    productSales[id].units += item.quantity ?? 1;
  }

  const topProductIds = Object.entries(productSales)
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(([id]) => id);

  let topProducts: any[] = [];
  if (topProductIds.length > 0) {
    const { data } = await supabase
      .from("products")
      .select("id, name, slug, price, category")
      .in("id", topProductIds);
    topProducts = (data ?? []).map((p: any) => ({
      ...p,
      revenue30d: productSales[p.id]?.revenue ?? 0,
      unitsSold30d: productSales[p.id]?.units ?? 0,
    }));
    topProducts.sort((a: any, b: any) => b.revenue30d - a.revenue30d);
  }

  // Best keywords from shopping optimizations
  const { data: optimizations } = await supabase
    .from("shopping_optimizations")
    .select("product_id, optimized_title, google_category, boost_score")
    .order("boost_score", { ascending: false })
    .limit(20);

  const bestKeywords = (optimizations ?? [])
    .filter((o: any) => o.optimized_title)
    .map((o: any) => {
      const words = o.optimized_title.split(/\s+/).slice(0, 4).join(" ");
      return { keyword: words, boostScore: o.boost_score ?? 0 };
    });

  // Shopping performance from winners
  const { data: winners } = await supabase
    .from("shopping_winners")
    .select("product_id, score, optimized_title, google_category, priority_feed")
    .eq("priority_feed", true)
    .order("score", { ascending: false })
    .limit(10);

  return json({
    topProducts,
    trafficSources: [
      { source: "Google Shopping", status: "active", optimizedProducts: (winners ?? []).length },
      { source: "Organic SEO", status: "active", guidesPublished: 0 },
      { source: "Direct", status: "tracking" },
    ],
    bestKeywords,
    shoppingPerformance: (winners ?? []).map((w: any) => ({
      productId: w.product_id,
      title: w.optimized_title,
      category: w.google_category,
      score: w.score,
    })),
  });
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

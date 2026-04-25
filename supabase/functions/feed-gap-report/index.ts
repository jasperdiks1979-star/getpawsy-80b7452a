import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://getpawsy.pet";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all products from DB — include is_duplicate, category_id, shipping fields
    const { data: allProducts, error: prodError } = await adminClient
      .from("products")
      .select("id, name, slug, price, compare_at_price, image_url, images, stock, is_active, is_duplicate");

    if (prodError) throw new Error(`DB error: ${prodError.message}`);

    // Fetch merchant feed
    let feedBody = "";
    try {
      const feedRes = await fetch(`${SITE_URL}/merchant-feed.xml`, {
        signal: AbortSignal.timeout(15000),
        headers: { "User-Agent": "GetPawsy-FeedGap/1.0" },
      });
      feedBody = await feedRes.text();
    } catch (e) {
      throw new Error(`Failed to fetch merchant feed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Extract product IDs from feed (look for <g:id> tags)
    const feedIdRegex = /<g:id>([^<]+)<\/g:id>/g;
    const feedIds = new Set<string>();
    let match;
    while ((match = feedIdRegex.exec(feedBody)) !== null) {
      feedIds.add(match[1].trim());
    }

    // Also try slug-based matching from <link> tags
    const feedLinkRegex = /<link>([^<]+)<\/link>/g;
    const feedSlugs = new Set<string>();
    while ((match = feedLinkRegex.exec(feedBody)) !== null) {
      const url = match[1].trim();
      const slugMatch = url.match(/\/product\/([^/?#]+)/);
      if (slugMatch) feedSlugs.add(slugMatch[1]);
    }

    const products = allProducts || [];
    const missingProducts: Array<{
      id: string;
      title: string;
      reason: string;
      in_stock: boolean;
      price: number | null;
      image_count: number;
      feed_included: boolean;
    }> = [];

    // Reason counters
    const reasonCounts: Record<string, number> = {};

    for (const p of products) {
      const inFeed = feedIds.has(p.id) || feedIds.has(p.slug) || feedSlugs.has(p.slug);
      if (inFeed) continue;

      let reason = "other";
      const imageCount = 1 + (Array.isArray(p.images) ? p.images.length : 0);

      if (p.is_duplicate) {
        reason = "is_duplicate";
      } else if (!p.is_active) {
        reason = "inactive";
      } else if (p.stock !== null && p.stock <= 0) {
        reason = "out_of_stock";
      } else if (!p.price || p.price <= 0) {
        reason = "missing_price";
      } else if (!p.image_url) {
        reason = "missing_image";
      }

      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;

      missingProducts.push({
        id: p.id,
        title: p.name || "Untitled",
        reason,
        in_stock: p.stock === null || p.stock > 0,
        price: p.price,
        image_count: p.image_url ? imageCount : 0,
        feed_included: false,
      });
    }

    const url = new URL(req.url);
    const format = url.searchParams.get("format");

    const report = {
      generated_at: new Date().toISOString(),
      totalProducts: products.length,
      inFeed: feedIds.size,
      missingFromFeed: missingProducts.length,
      reasonBreakdown: reasonCounts,
      missingProducts,
    };

    if (format === "csv") {
      const csvHeader = "product_id,title,reason,in_stock,price,image_count,feed_included";
      const csvRows = missingProducts.map(p =>
        `"${p.id}","${(p.title || "").replace(/"/g, '""')}","${p.reason}",${p.in_stock},${p.price ?? ""},${p.image_count},${p.feed_included}`
      );
      const csv = [csvHeader, ...csvRows].join("\n");
      const dateStr = new Date().toISOString().split("T")[0];

      return new Response(csv, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="feed-gap-report-${dateStr}.csv"`,
        },
      });
    }

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[feed-gap-report] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

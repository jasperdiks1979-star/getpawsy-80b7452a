import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://getpawsy.pet";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const sample = url.searchParams.get("sample") === "true";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const client = createClient(supabaseUrl, serviceKey);

    const { data: products, error } = await client
      .from("products")
      .select("id,name,price,image_url,slug,is_active,optimized_title,optimized_description")
      .eq("is_active", true)
      .eq("is_duplicate", false)
      .gt("price", 0)
      .not("image_url", "is", null)
      .not("slug", "is", null)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) throw new Error(`DB: ${error.message}`);

    const all = products || [];
    const missingPrices = all.filter(p => !p.price || p.price <= 0);
    const missingImages = all.filter(p => !p.image_url);
    const missingSlugs = all.filter(p => !p.slug);
    const missingOptTitle = all.filter(p => !p.optimized_title);
    const missingOptDesc = all.filter(p => !p.optimized_description);

    if (sample) {
      const sampleProducts = all.slice(0, 5).map(p => ({
        title: p.optimized_title || p.name,
        link: `${BASE_URL}/product/${p.slug}`,
        image_link: p.image_url,
        price: `${(p.price || 0).toFixed(2)} USD`,
        availability: p.is_active === false ? "out of stock" : "in stock",
      }));

      return new Response(JSON.stringify({ ok: true, sample: sampleProducts }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const report = {
      ok: true,
      productCount: all.length,
      feedUrls: [
        `${BASE_URL}/google-feed.xml`,
        `${BASE_URL}/merchant-feed.xml`,
        `${BASE_URL}/google-shopping-feed.xml`,
      ],
      missingPrices: missingPrices.length,
      missingImages: missingImages.length,
      missingSlugs: missingSlugs.length,
      missingOptimizedTitles: missingOptTitle.length,
      missingOptimizedDescriptions: missingOptDesc.length,
      invalidProductUrls: missingSlugs.map(p => p.id),
      invalidImageUrls: missingImages.map(p => p.id),
    };

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

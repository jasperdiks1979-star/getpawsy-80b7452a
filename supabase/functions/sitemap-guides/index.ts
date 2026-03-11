import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "text/xml; charset=utf-8",
  "Cache-Control": "public, max-age=3600, s-maxage=3600",
};

const SITE = "https://getpawsy.pet";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { ...corsHeaders, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch published guides from DB
    const { data: dbGuides, error } = await supabase
      .from("published_guides")
      .select("slug, published_at, updated_at")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("[sitemap-guides] DB error:", error);
    }

    // Also include known static guide slugs from the data directory
    // These are loaded from the guides index at build time
    const staticGuideUrls: string[] = [];

    // Combine DB + static guides, deduplicating by slug
    const slugSet = new Set<string>();
    const urls: string[] = [];

    // DB guides first (more authoritative source)
    for (const guide of dbGuides || []) {
      if (slugSet.has(guide.slug)) continue;
      slugSet.add(guide.slug);
      const lastmod = (guide.updated_at || guide.published_at || new Date().toISOString()).split("T")[0];
      urls.push(`  <url>
    <loc>${SITE}/guides/${guide.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.70</priority>
  </url>`);
    }

    // Hub page
    urls.unshift(`  <url>
    <loc>${SITE}/pet-care-guides</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.80</priority>
  </url>`);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    return new Response(xml, { headers: corsHeaders });
  } catch (e) {
    console.error("[sitemap-guides] error:", e);
    return new Response(`<!-- Error: ${String(e)} -->`, {
      headers: corsHeaders,
      status: 500,
    });
  }
});

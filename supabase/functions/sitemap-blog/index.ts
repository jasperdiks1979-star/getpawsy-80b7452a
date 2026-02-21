import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "text/xml; charset=utf-8",
  "Cache-Control": "public, max-age=3600, s-maxage=3600",
};

const SITE = "https://getpawsy.pet";

// Non-core categories that should be excluded from sitemap (noindex)
const NOINDEX_CATEGORIES = ["Fish", "Birds", "Reptiles", "Small Pets"];

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

    // Fetch all published blog posts (up to 1000)
    const { data: posts, error } = await supabase
      .from("blog_posts")
      .select("slug, published_at, updated_at, category")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("[sitemap-blog] DB error:", error);
      return new Response(`<!-- DB error: ${error.message} -->`, {
        headers: corsHeaders,
        status: 500,
      });
    }

    // Filter out non-core categories
    const indexablePosts = (posts || []).filter(
      (p) => !NOINDEX_CATEGORIES.includes(p.category)
    );

    const urls = indexablePosts.map((post) => {
      const lastmod = post.updated_at || post.published_at || new Date().toISOString();
      const lastmodDate = lastmod.split("T")[0];
      return `  <url>
    <loc>${SITE}/blog/${post.slug}</loc>
    <lastmod>${lastmodDate}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.60</priority>
  </url>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    return new Response(xml, { headers: corsHeaders });
  } catch (e) {
    console.error("[sitemap-blog] error:", e);
    return new Response(`<!-- Error: ${String(e)} -->`, {
      headers: corsHeaders,
      status: 500,
    });
  }
});

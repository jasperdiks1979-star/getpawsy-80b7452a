import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CANONICAL_HOST = "https://getpawsy.pet";
const MAX_URLS_PER_SITEMAP = 500;

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const pageParam = url.searchParams.get("page");
    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const statsOnly = url.searchParams.get("stats") === "true";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Fetch all active, non-duplicate products with slugs (exclude Tier C and B2 from sitemaps)
    // Tier B2 is index,follow but NOT in sitemaps (crawl budget control)
    const { data: products, error } = await sb
      .from("products")
      .select("slug, updated_at, is_active, is_duplicate, stock, name, seo_tier, image_url, images")
      .eq("is_active", true)
      .not("slug", "is", null)
      .in("seo_tier", ["A", "B1"])
      .order("updated_at", { ascending: false })
      .limit(10000);

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Filter: non-duplicate, has slug, active
    const indexable = (products || []).filter(p =>
      !p.is_duplicate &&
      p.slug &&
      p.slug.trim() !== ""
    );

    // Deduplicate by slug (keep most recently updated)
    const slugMap = new Map<string, typeof indexable[0]>();
    for (const p of indexable) {
      if (!slugMap.has(p.slug!)) {
        slugMap.set(p.slug!, p);
      }
    }
    const uniqueProducts = Array.from(slugMap.values());

    // Exclusion stats
    const excluded = {
      inactive: (products || []).length - indexable.length,
      duplicateSlugs: indexable.length - uniqueProducts.length,
      total: (products || []).length - uniqueProducts.length,
    };

    // Stats-only mode for validation
    if (statsOnly) {
      return new Response(
        JSON.stringify({
          totalProducts: (products || []).length,
          indexableUrls: uniqueProducts.length,
          excluded,
          needsSplit: uniqueProducts.length > MAX_URLS_PER_SITEMAP,
          totalSitemapFiles: Math.ceil(uniqueProducts.length / MAX_URLS_PER_SITEMAP),
          generatedAt: new Date().toISOString(),
        }),
        { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } }
      );
    }

    // Pagination for future splitting
    const totalPages = Math.ceil(uniqueProducts.length / MAX_URLS_PER_SITEMAP);
    const validPage = Math.max(1, Math.min(page, totalPages || 1));
    const start = (validPage - 1) * MAX_URLS_PER_SITEMAP;
    const slice = uniqueProducts.slice(start, start + MAX_URLS_PER_SITEMAP);

    // Generate XML
    const urls = slice.map(p => {
      const loc = `${CANONICAL_HOST}/product/${p.slug}`;
      const lastmod = p.updated_at
        ? new Date(p.updated_at).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.80</priority>
  </url>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "X-Sitemap-Urls": String(slice.length),
        "X-Sitemap-Page": String(validPage),
        "X-Sitemap-Total-Pages": String(totalPages),
      },
    });
  } catch (err) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`,
      {
        status: 500,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      }
    );
  }
});

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

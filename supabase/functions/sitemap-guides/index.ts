import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "text/xml; charset=utf-8",
  "Cache-Control": "public, max-age=3600, s-maxage=3600",
};

const SITE = "https://getpawsy.pet";

/**
 * Sitemap for /guides/ pages.
 * 
 * Sources:
 * 1. published_guides table (DB-authoritative, includes is_indexed status)
 * 2. Static guide index JSON (build-time generated guides)
 * 
 * Money pages get priority 0.85, regular guides get 0.70.
 */

const MONEY_PAGE_SLUGS = new Set([
  'best-cat-trees-large-cats-2026', 'modern-cat-trees-home-design', 'best-luxury-cat-tree',
  'best-cat-trees-small-apartments', 'best-cat-tree-for-kittens', 'best-cat-tree-maine-coon',
  'best-cat-litter-box-2026', 'best-self-cleaning-litter-box-2026', 'best-cat-litter-for-odor-control',
  'best-litter-boxes-apartments-2026', 'best-litter-box-senior-cats',
  'best-orthopedic-dog-bed-2026', 'best-dog-beds-large-breeds-2026', 'calming-dog-bed-anxiety',
  'waterproof-orthopedic-dog-beds-guide', 'orthopedic-dog-beds-for-senior-dogs',
  'best-toys-for-aggressive-chewers', 'best-dog-toys-mental-stimulation', 'best-toys-for-bored-dogs',
  'best-dog-car-seat', 'best-pet-carrier-airline-approved', 'best-dog-stroller',
  'best-interactive-cat-toys-that-work', 'best-automatic-cat-toy',
  // Pillar pages
  'cat-tree-buying-guide', 'cat-litter-box-guide', 'dog-bed-buying-guide',
  'dog-toy-guide', 'pet-travel-guide', 'cat-toy-buying-guide',
  // Hub pillar pages
  'best-cat-products', 'best-dog-products', 'best-pet-accessories',
  // New money pages
  'best-cat-condo-2026', 'best-cat-window-perch', 'best-cat-food-bowls',
  'best-dog-travel-bowl', 'best-cat-litter-mat', 'best-dog-blanket',
  'best-dog-water-fountain', 'best-dog-slow-feeder', 'best-cat-travel-carrier',
]);

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

    // 1. Fetch published guides from DB
    const { data: dbGuides, error } = await supabase
      .from("published_guides")
      .select("slug, published_at, updated_at")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("[sitemap-guides] DB error:", error);
    }

    // 2. Fetch static guide index for build-time guides
    let staticGuides: { slug: string; publishedAt?: string; updatedAt?: string }[] = [];
    try {
      const res = await fetch(`${SITE}/data/guides/index.json`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        staticGuides = await res.json();
      }
    } catch {
      console.warn("[sitemap-guides] Could not fetch static guide index");
    }

    // 3. Combine and deduplicate
    const slugSet = new Set<string>();
    const urls: string[] = [];

    // DB guides first (authoritative)
    for (const guide of dbGuides || []) {
      if (slugSet.has(guide.slug)) continue;
      slugSet.add(guide.slug);
      const lastmod = (guide.updated_at || guide.published_at || new Date().toISOString()).split("T")[0];
      const priority = MONEY_PAGE_SLUGS.has(guide.slug) ? "0.85" : "0.70";
      urls.push(`  <url>
    <loc>${SITE}/guides/${guide.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`);
    }

    // Static guides (fill gaps)
    for (const guide of staticGuides) {
      if (slugSet.has(guide.slug)) continue;
      slugSet.add(guide.slug);
      const lastmod = (guide.updatedAt || guide.publishedAt || new Date().toISOString()).split("T")[0];
      const priority = MONEY_PAGE_SLUGS.has(guide.slug) ? "0.85" : "0.70";
      urls.push(`  <url>
    <loc>${SITE}/guides/${guide.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`);
    }

    // Hub page
    urls.unshift(`  <url>
    <loc>${SITE}/pet-care-guides</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.85</priority>
  </url>`);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "X-Sitemap-Urls": String(urls.length),
        "X-Sitemap-Source": "db+static",
      },
    });
  } catch (e) {
    console.error("[sitemap-guides] error:", e);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`, {
      headers: corsHeaders,
      status: 500,
    });
  }
});
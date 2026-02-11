import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "X-Robots-Tag": "all",
  "X-Content-Served-Identically": "true",
};

// Guide slugs loaded dynamically from the live guides index
let _cachedGuides: Array<{ slug: string; updatedAt: string; priority?: string }> | null = null;

async function loadGuides(): Promise<Array<{ slug: string; updatedAt: string; priority?: string }>> {
  if (_cachedGuides) return _cachedGuides;
  try {
    const res = await fetch('https://getpawsy.pet/data/guides/index.json');
    if (res.ok) {
      const guides = await res.json();
      _cachedGuides = guides.map((g: { slug: string; updatedAt: string; keywords?: string[] }) => ({
        slug: g.slug,
        updatedAt: g.updatedAt || new Date().toISOString().split('T')[0],
        // Cornerstones get higher priority
        priority: g.slug.startsWith('best-cat-litter-box-2026') ? '0.9' :
                  g.slug.startsWith('best-') ? '0.8' : '0.7',
      }));
      console.log(`[sitemap] Loaded ${_cachedGuides.length} guides from index.json`);
      return _cachedGuides;
    }
  } catch (e) {
    console.warn('[sitemap] Failed to load guides index, using fallback:', e);
  }
  // Fallback hardcoded list
  _cachedGuides = [
    { slug: "best-cat-litter-box-2026", updatedAt: "2026-02-10", priority: "0.9" },
    { slug: "how-many-litter-boxes-per-cat", updatedAt: "2026-02-10", priority: "0.8" },
    { slug: "best-cat-litter-box-furniture-enclosures-2026", updatedAt: "2026-02-11", priority: "0.8" },
    { slug: "best-litter-boxes-multi-cat", updatedAt: "2026-02-12", priority: "0.75" },
    { slug: "best-extra-large-litter-boxes", updatedAt: "2026-02-13", priority: "0.75" },
    { slug: "best-cat-trees-small-apartments", updatedAt: "2026-02-14", priority: "0.75" },
    { slug: "how-to-choose-guinea-pig-cage", updatedAt: "2026-02-10" },
    { slug: "guinea-pig-cage-vs-playpen", updatedAt: "2026-02-10" },
    { slug: "cat-condo-vs-cat-tower", updatedAt: "2026-02-10" },
    { slug: "choosing-safe-cat-tree-indoor", updatedAt: "2026-02-10" },
    { slug: "outdoor-dog-games-enrichment", updatedAt: "2026-02-10" },
  ];
  return _cachedGuides;
}

const BASE_URL = "https://getpawsy.pet";
// v3: Use direct edge function URLs for sitemap index (Google can't follow SPA redirects)
const SITEMAP_FN_URL = "https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/generate-sitemap";
console.log("[sitemap] v3 loaded, FN URL:", SITEMAP_FN_URL);

interface Product {
  id: string;
  name: string;
  slug: string | null;
  updated_at: string;
  category: string | null;
  image_url: string | null;
}

interface Category {
  slug: string;
  name: string;
  created_at: string;
}

interface BlogPost {
  slug: string;
  title: string;
  published_at: string;
  featured_image: string | null;
}

interface Bestseller {
  slug: string;
  updated_at: string;
}

interface SeoCollection {
  slug: string;
  name: string;
  updated_at: string;
}

function xmlHeader(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "index";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date().toISOString().split("T")[0];
    const headers = { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" };

    // Generate sitemap based on type
    switch (type) {
      case "index":
        return new Response(generateSitemapIndex(today), { headers, status: 200 });

      case "guides":
        return new Response(await generateGuidesSitemap(today), { headers, status: 200 });


      case "static":
        return new Response(generateStaticSitemap(today), { headers, status: 200 });

      case "products": {
        const { data: products } = await supabase
          .from("products")
          .select("id, name, slug, updated_at, category, image_url")
          .eq("is_active", true)
          .eq("is_duplicate", false)
          .order("updated_at", { ascending: false });
        return new Response(generateProductsSitemap(products || [], today), { headers, status: 200 });
      }

      case "categories": {
        const { data: categories } = await supabase
          .from("categories")
          .select("slug, name, created_at");
        
        // Also get unique categories from products
        const { data: products } = await supabase
          .from("products")
          .select("category")
          .eq("is_active", true)
          .eq("is_duplicate", false);
        
        const productCategories = new Set<string>();
        (products || []).forEach((p) => {
          if (p.category) productCategories.add(p.category);
        });

        return new Response(
          generateCategoriesSitemap(categories || [], Array.from(productCategories), today),
          { headers, status: 200 }
        );
      }

      case "bestsellers": {
        const { data: bestsellers } = await supabase
          .from("bestsellers")
          .select("slug, updated_at")
          .eq("is_active", true);
        return new Response(generateBestsellersSitemap(bestsellers || [], today), { headers, status: 200 });
      }

      case "collections": {
        const { data: collections } = await supabase
          .from("seo_collections")
          .select("slug, name, updated_at")
          .eq("is_active", true);
        return new Response(generateCollectionsSitemap(collections || [], today), { headers, status: 200 });
      }

      case "blog": {
        const { data: posts } = await supabase
          .from("blog_posts")
          .select("slug, title, published_at, featured_image")
          .eq("is_published", true)
          .order("published_at", { ascending: false });
        return new Response(generateBlogSitemap(posts || [], today), { headers, status: 200 });
      }

      default:
        return new Response(generateSitemapIndex(today), { headers, status: 200 });
    }
  } catch (error) {
    console.error("Error generating sitemap:", error);
    const headers = { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" };
    return new Response(
      `${xmlHeader()}
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${BASE_URL}/sitemap-static.xml</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
  </sitemap>
</sitemapindex>`,
      { headers, status: 200 }
    );
  }
});

function generateSitemapIndex(today: string): string {
  // Use direct edge function URLs so Google doesn't need JS to resolve sub-sitemaps (v2)
  return `${xmlHeader()}
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${SITEMAP_FN_URL}?type=static</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITEMAP_FN_URL}?type=products</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITEMAP_FN_URL}?type=categories</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITEMAP_FN_URL}?type=bestsellers</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITEMAP_FN_URL}?type=collections</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITEMAP_FN_URL}?type=blog</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${SITEMAP_FN_URL}?type=guides</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
</sitemapindex>`;
}

function generateStaticSitemap(today: string): string {
  // Calculate yesterday for more realistic lastmod on static pages
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  
  return `${xmlHeader()}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Homepage - Highest priority, changes frequently -->
  <url>
    <loc>${BASE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
  
  <!-- Main Product Listing - High priority, very fresh -->
  <url>
    <loc>${BASE_URL}/products</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.95</priority>
  </url>
  
  <!-- Bestsellers - Popular content, changes often -->
  <url>
    <loc>${BASE_URL}/bestsellers</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.95</priority>
  </url>
  
  <!-- Blog Index - Fresh content signal -->
  <url>
    <loc>${BASE_URL}/blog</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.85</priority>
  </url>
  
  <!-- About Page - Trust signal -->
  <url>
    <loc>${BASE_URL}/about</loc>
    <lastmod>${yesterday}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  
  <!-- Contact Page - Trust signal -->
  <url>
    <loc>${BASE_URL}/contact</loc>
    <lastmod>${yesterday}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>
  
  <!-- FAQ Page - SEO valuable -->
  <url>
    <loc>${BASE_URL}/faq</loc>
    <lastmod>${yesterday}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.65</priority>
  </url>
  
  <!-- Shipping Info -->
  <url>
    <loc>${BASE_URL}/shipping</loc>
    <lastmod>${yesterday}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>
  
  <!-- Return Policy -->
  <url>
    <loc>${BASE_URL}/returns</loc>
    <lastmod>${yesterday}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  
  <!-- Privacy Policy -->
  <url>
    <loc>${BASE_URL}/privacy</loc>
    <lastmod>${yesterday}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  
  <!-- Terms of Service -->
  <url>
    <loc>${BASE_URL}/terms</loc>
    <lastmod>${yesterday}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>`;
}

function generateProductsSitemap(products: Product[], today: string): string {
  let urls = "";
  
  // Calculate priority based on recency - newer products get higher priority
  const now = new Date();
  
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const lastmod = product.updated_at?.split("T")[0] || today;
    const productName = escapeXml(product.name || "");
    const productPath = product.slug || product.id;
    
    // Calculate priority: 0.9 for recently updated, decreasing by position
    // Top 100 products get higher priority
    const basePriority = i < 100 ? 0.9 : i < 500 ? 0.8 : 0.7;
    
    // Boost priority for products updated in last 7 days
    const updateDate = new Date(product.updated_at || today);
    const daysSinceUpdate = Math.floor((now.getTime() - updateDate.getTime()) / 86400000);
    const recencyBoost = daysSinceUpdate <= 1 ? 0.05 : daysSinceUpdate <= 7 ? 0.02 : 0;
    const priority = Math.min(0.95, basePriority + recencyBoost).toFixed(2);
    
    // Changefreq based on category - some categories change more often
    const changefreq = daysSinceUpdate <= 7 ? "daily" : "weekly";
    
    urls += `
  <url>
    <loc>${BASE_URL}/product/${productPath}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>${product.image_url ? `
    <image:image>
      <image:loc>${escapeXml(product.image_url)}</image:loc>
      <image:title>${productName}</image:title>
    </image:image>` : ""}
  </url>`;
  }

  console.log(`Products sitemap: ${products.length} products`);

  return `${xmlHeader()}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}
</urlset>`;
}

function generateCategoriesSitemap(
  dbCategories: Category[],
  productCategories: string[],
  today: string
): string {
  let urls = "";
  const addedSlugs = new Set<string>();

  // Helper to convert name to slug
  const toSlug = (str: string): string => {
    return str
      .toLowerCase()
      .trim()
      .replace(/&/g, 'and')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  };

  // Add categories from database - use slug from DB
  for (const category of dbCategories) {
    const categorySlug = category.slug || toSlug(category.name);
    if (!addedSlugs.has(categorySlug)) {
      addedSlugs.add(categorySlug);
      urls += `
  <url>
    <loc>${BASE_URL}/products?category=${categorySlug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    }
  }

  // Add categories from products that aren't in DB - convert to slug
  for (const category of productCategories) {
    const categorySlug = toSlug(category);
    if (!addedSlugs.has(categorySlug)) {
      addedSlugs.add(categorySlug);
      urls += `
  <url>
    <loc>${BASE_URL}/products?category=${categorySlug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`;
    }
  }

  console.log(`Categories sitemap: ${addedSlugs.size} categories`);

  return `${xmlHeader()}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;
}

function generateBestsellersSitemap(bestsellers: Bestseller[], today: string): string {
  let urls = "";
  
  for (const bestseller of bestsellers) {
    const lastmod = bestseller.updated_at?.split("T")[0] || today;
    urls += `
  <url>
    <loc>${BASE_URL}/bestseller/${bestseller.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`;
  }

  console.log(`Bestsellers sitemap: ${bestsellers.length} bestsellers`);

  return `${xmlHeader()}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;
}

function generateCollectionsSitemap(collections: SeoCollection[], today: string): string {
  let urls = "";
  
  for (const collection of collections) {
    const lastmod = collection.updated_at?.split("T")[0] || today;
    urls += `
  <url>
    <loc>${BASE_URL}/collections/${collection.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>`;
  }

  console.log(`SEO Collections sitemap: ${collections.length} collections`);

  return `${xmlHeader()}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;
}

function generateBlogSitemap(posts: BlogPost[], today: string): string {
  let urls = "";
  
  for (const post of posts) {
    const lastmod = post.published_at?.split("T")[0] || today;
    const postTitle = escapeXml(post.title || "");
    
    urls += `
  <url>
    <loc>${BASE_URL}/blog/${post.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>${post.featured_image ? `
    <image:image>
      <image:loc>${escapeXml(post.featured_image)}</image:loc>
      <image:title>${postTitle}</image:title>
    </image:image>` : ""}
  </url>`;
  }

  console.log(`Blog sitemap: ${posts.length} posts`);

  return `${xmlHeader()}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}
</urlset>`;
}

async function generateGuidesSitemap(today: string): Promise<string> {
  const GUIDES = await loadGuides();
  let urls = `
  <url>
    <loc>${BASE_URL}/guides/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;

  for (const guide of GUIDES) {
    const lastmod = guide.updatedAt || today;
    const priority = guide.priority || "0.7";
    urls += `
  <url>
    <loc>${BASE_URL}/guides/${guide.slug}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
  </url>`;
  }

  console.log(`Guides sitemap: ${GUIDES.length} guides`);

  return `${xmlHeader()}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;
}

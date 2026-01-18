import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://getpawsy.lovable.app";
const FUNCTION_URL = "https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/generate-sitemap";

interface Product {
  id: string;
  name: string;
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

      case "static":
        return new Response(generateStaticSitemap(today), { headers, status: 200 });

      case "products": {
        const { data: products } = await supabase
          .from("products")
          .select("id, name, updated_at, category, image_url")
          .eq("is_active", true)
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
          .eq("is_active", true);
        
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
    <loc>${FUNCTION_URL}?type=static</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
  </sitemap>
</sitemapindex>`,
      { headers, status: 200 }
    );
  }
});

function generateSitemapIndex(today: string): string {
  return `${xmlHeader()}
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Static Pages Sitemap -->
  <sitemap>
    <loc>${FUNCTION_URL}?type=static</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  
  <!-- Products Sitemap -->
  <sitemap>
    <loc>${FUNCTION_URL}?type=products</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  
  <!-- Categories Sitemap -->
  <sitemap>
    <loc>${FUNCTION_URL}?type=categories</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  
  <!-- Bestsellers Sitemap -->
  <sitemap>
    <loc>${FUNCTION_URL}?type=bestsellers</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  
  <!-- Blog Posts Sitemap -->
  <sitemap>
    <loc>${FUNCTION_URL}?type=blog</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
</sitemapindex>`;
}

function generateStaticSitemap(today: string): string {
  return `${xmlHeader()}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Homepage -->
  <url>
    <loc>${BASE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  
  <!-- Main Product Listing -->
  <url>
    <loc>${BASE_URL}/products</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  
  <!-- Blog Index -->
  <url>
    <loc>${BASE_URL}/blog</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  
  <!-- About Page -->
  <url>
    <loc>${BASE_URL}/about</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  
  <!-- Contact Page -->
  <url>
    <loc>${BASE_URL}/contact</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  
  <!-- FAQ Page -->
  <url>
    <loc>${BASE_URL}/faq</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  
  <!-- Shipping Info -->
  <url>
    <loc>${BASE_URL}/shipping</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  
  <!-- Return Policy -->
  <url>
    <loc>${BASE_URL}/return-policy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  
  <!-- Privacy Policy -->
  <url>
    <loc>${BASE_URL}/privacy-policy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  
  <!-- Terms of Service -->
  <url>
    <loc>${BASE_URL}/terms-of-service</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  
  <!-- Cookie Policy -->
  <url>
    <loc>${BASE_URL}/cookie-policy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>`;
}

function generateProductsSitemap(products: Product[], today: string): string {
  let urls = "";
  
  for (const product of products) {
    const lastmod = product.updated_at?.split("T")[0] || today;
    const productName = escapeXml(product.name || "");
    
    urls += `
  <url>
    <loc>${BASE_URL}/products/${product.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>${product.image_url ? `
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
  const addedCategories = new Set<string>();

  // Add categories from database
  for (const category of dbCategories) {
    const categoryName = category.name.toLowerCase();
    if (!addedCategories.has(categoryName)) {
      addedCategories.add(categoryName);
      urls += `
  <url>
    <loc>${BASE_URL}/products?category=${encodeURIComponent(category.name)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
    }
  }

  // Add categories from products that aren't in DB
  for (const category of productCategories) {
    const categoryName = category.toLowerCase();
    if (!addedCategories.has(categoryName)) {
      addedCategories.add(categoryName);
      urls += `
  <url>
    <loc>${BASE_URL}/products?category=${encodeURIComponent(category)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`;
    }
  }

  console.log(`Categories sitemap: ${addedCategories.size} categories`);

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

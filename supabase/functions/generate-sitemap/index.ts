import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/xml; charset=utf-8",
};

const BASE_URL = "https://getpawsy.lovable.app";

interface Product {
  id: string;
  updated_at: string;
  category: string | null;
}

interface Category {
  slug: string;
  name: string;
}

interface BlogPost {
  slug: string;
  published_at: string;
}

interface Bestseller {
  slug: string;
  updated_at: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all active products
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, updated_at, category")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    if (productsError) {
      console.error("Error fetching products:", productsError);
    }

    // Fetch all categories
    const { data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select("slug, name");

    if (categoriesError) {
      console.error("Error fetching categories:", categoriesError);
    }

    // Fetch all published blog posts
    const { data: blogPosts, error: blogError } = await supabase
      .from("blog_posts")
      .select("slug, published_at")
      .eq("is_published", true)
      .order("published_at", { ascending: false });

    if (blogError) {
      console.error("Error fetching blog posts:", blogError);
    }

    // Fetch all active bestsellers
    const { data: bestsellers, error: bestsellersError } = await supabase
      .from("bestsellers")
      .select("slug, updated_at")
      .eq("is_active", true);

    if (bestsellersError) {
      console.error("Error fetching bestsellers:", bestsellersError);
    }

    // Get unique categories from products for category pages
    const productCategories = new Set<string>();
    (products || []).forEach((p: Product) => {
      if (p.category) {
        productCategories.add(p.category);
      }
    });

    const today = new Date().toISOString().split("T")[0];

    // Build sitemap XML
    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  
  <!-- Static Pages -->
  <url>
    <loc>${BASE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${BASE_URL}/products</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${BASE_URL}/blog</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>${BASE_URL}/about</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${BASE_URL}/contact</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${BASE_URL}/faq</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${BASE_URL}/shipping</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>${BASE_URL}/return-policy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>
  <url>
    <loc>${BASE_URL}/privacy-policy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${BASE_URL}/terms-of-service</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${BASE_URL}/cookie-policy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
`;

    // Add category pages from database
    if (categories && categories.length > 0) {
      sitemap += `\n  <!-- Category Pages (Database) -->\n`;
      for (const category of categories as Category[]) {
        sitemap += `  <url>
    <loc>${BASE_URL}/products?category=${encodeURIComponent(category.name)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>\n`;
      }
    }

    // Add category pages from products (for any not in categories table)
    if (productCategories.size > 0) {
      const dbCategoryNames = new Set((categories || []).map((c: Category) => c.name.toLowerCase()));
      const additionalCategories = Array.from(productCategories).filter(
        (cat) => !dbCategoryNames.has(cat.toLowerCase())
      );

      if (additionalCategories.length > 0) {
        sitemap += `\n  <!-- Category Pages (From Products) -->\n`;
        for (const category of additionalCategories) {
          sitemap += `  <url>
    <loc>${BASE_URL}/products?category=${encodeURIComponent(category)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>\n`;
        }
      }
    }

    // Add bestseller pages
    if (bestsellers && bestsellers.length > 0) {
      sitemap += `\n  <!-- Bestseller Pages -->\n`;
      for (const bestseller of bestsellers as Bestseller[]) {
        const lastmod = bestseller.updated_at?.split("T")[0] || today;
        sitemap += `  <url>
    <loc>${BASE_URL}/bestseller/${bestseller.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>\n`;
      }
    }

    // Add product pages
    if (products && products.length > 0) {
      sitemap += `\n  <!-- Product Pages -->\n`;
      for (const product of products as Product[]) {
        const lastmod = product.updated_at?.split("T")[0] || today;
        sitemap += `  <url>
    <loc>${BASE_URL}/products/${product.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>\n`;
      }
    }

    // Add blog posts
    if (blogPosts && blogPosts.length > 0) {
      sitemap += `\n  <!-- Blog Posts -->\n`;
      for (const post of blogPosts as BlogPost[]) {
        const lastmod = post.published_at?.split("T")[0] || today;
        sitemap += `  <url>
    <loc>${BASE_URL}/blog/${post.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>\n`;
      }
    }

    sitemap += `</urlset>`;

    // Log stats
    console.log(`Sitemap generated: ${(products || []).length} products, ${(categories || []).length} categories, ${(blogPosts || []).length} blog posts, ${(bestsellers || []).length} bestsellers`);

    return new Response(sitemap, {
      headers: corsHeaders,
      status: 200,
    });
  } catch (error) {
    console.error("Error generating sitemap:", error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE_URL}/</loc>
    <lastmod>${new Date().toISOString().split("T")[0]}</lastmod>
    <priority>1.0</priority>
  </url>
</urlset>`,
      {
        headers: corsHeaders,
        status: 200,
      }
    );
  }
});

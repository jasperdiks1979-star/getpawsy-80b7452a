import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface TriageRow {
  url: string;
  source: "sitemap" | "db-product" | "db-blog" | "db-guide" | "db-collection" | "legacy" | "crawl";
  status: number | null;
  redirectTo: string | null;
  existsInDb: boolean;
  fixAction: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);
    const baseUrl = "https://getpawsy.pet";

    // 1. Fetch all active product slugs
    const { data: products } = await sb
      .from("products")
      .select("slug, id, is_active")
      .eq("is_active", true)
      .not("slug", "is", null)
      .limit(1000);

    // 2. Fetch all published blog slugs
    const { data: blogs } = await sb
      .from("blog_posts")
      .select("slug")
      .eq("is_published", true)
      .limit(500);

    // 3. Fetch collection/category slugs
    const { data: categories } = await sb
      .from("categories")
      .select("slug")
      .limit(100);

    // 4. Fetch bestseller slugs
    const { data: bestsellers } = await sb
      .from("bestsellers")
      .select("slug")
      .eq("is_active", true)
      .limit(50);

    // Build URL sets to check
    const urlsToCheck: Array<{ url: string; source: TriageRow["source"] }> = [];

    // Product URLs
    for (const p of (products ?? []).slice(0, 50)) {
      urlsToCheck.push({ url: `${baseUrl}/product/${p.slug}`, source: "db-product" });
    }

    // Blog URLs
    for (const b of (blogs ?? []).slice(0, 20)) {
      urlsToCheck.push({ url: `${baseUrl}/blog/${b.slug}`, source: "db-blog" });
    }

    // Category URLs
    for (const c of (categories ?? []).slice(0, 20)) {
      urlsToCheck.push({ url: `${baseUrl}/c/${c.slug}`, source: "db-collection" });
    }

    // Bestseller URLs
    for (const bs of (bestsellers ?? []).slice(0, 10)) {
      urlsToCheck.push({ url: `${baseUrl}/bestseller/${bs.slug}`, source: "db-product" });
    }

    // Legacy patterns (common GSC 4xx sources)
    const legacyPatterns = [
      "/products", "/products/", "/shop", "/shop/all",
      "/pages/contact", "/pages/about", "/pages/faq",
      "/collections", "/collections/dogs", "/collections/cats",
      "/category/dogs", "/category/cats",
      "/sitemap.xml", "/robots.txt", "/merchant-feed.xml",
    ];
    for (const p of legacyPatterns) {
      urlsToCheck.push({ url: `${baseUrl}${p}`, source: "legacy" });
    }

    // Check each URL (HEAD request, manual redirect)
    const results: TriageRow[] = [];

    // Process in batches of 10 to avoid overwhelming
    for (let i = 0; i < urlsToCheck.length; i += 10) {
      const batch = urlsToCheck.slice(i, i + 10);
      const batchResults = await Promise.all(
        batch.map(async ({ url, source }) => {
          try {
            const res = await fetch(url, {
              method: "HEAD",
              redirect: "manual",
              headers: { "User-Agent": "GetPawsy-UrlTriage/1.0" },
            });
            const location = res.headers.get("location");
            const status = res.status;

            let fixAction = "ok";
            if (status === 404) fixAction = "needs-redirect-or-410";
            else if (status === 302) fixAction = "upgrade-to-301";
            else if (status >= 400) fixAction = `error-${status}`;
            else if (status === 301) fixAction = "301-ok";

            return {
              url: url.replace(baseUrl, ""),
              source,
              status,
              redirectTo: location,
              existsInDb: source.startsWith("db-"),
              fixAction,
            } as TriageRow;
          } catch {
            return {
              url: url.replace(baseUrl, ""),
              source,
              status: null,
              redirectTo: null,
              existsInDb: source.startsWith("db-"),
              fixAction: "fetch-error",
            } as TriageRow;
          }
        })
      );
      results.push(...batchResults);
    }

    // Summary
    const summary = {
      total: results.length,
      ok: results.filter(r => r.status === 200).length,
      redirects: results.filter(r => r.status && r.status >= 300 && r.status < 400).length,
      errors4xx: results.filter(r => r.status && r.status >= 400 && r.status < 500).length,
      errors5xx: results.filter(r => r.status && r.status >= 500).length,
      fetchErrors: results.filter(r => r.status === null).length,
      productsChecked: (products ?? []).length,
      blogsChecked: (blogs ?? []).length,
      categoriesChecked: (categories ?? []).length,
    };

    return new Response(
      JSON.stringify({ results, summary, checkedAt: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

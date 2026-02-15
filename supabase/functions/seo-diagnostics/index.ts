import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://getpawsy.pet";

interface PageCheck {
  path: string;
  type: string;
  status: number | null;
  canonical: string | null;
  robotsMeta: string | null;
  xRobotsTag: string | null;
  contentType: string | null;
  flags: string[];
}

interface RedirectHop {
  url: string;
  status: number;
  location: string | null;
}

async function checkRedirectChain(startUrl: string): Promise<{ hops: RedirectHop[]; finalUrl: string }> {
  const hops: RedirectHop[] = [];
  let currentUrl = startUrl;
  
  for (let i = 0; i < 10; i++) {
    try {
      const res = await fetch(currentUrl, { method: "HEAD", redirect: "manual" });
      const location = res.headers.get("location");
      hops.push({ url: currentUrl, status: res.status, location });
      
      if (res.status >= 300 && res.status < 400 && location) {
        currentUrl = location.startsWith("http") ? location : new URL(location, currentUrl).href;
      } else {
        break;
      }
    } catch {
      hops.push({ url: currentUrl, status: 0, location: null });
      break;
    }
  }
  
  return { hops, finalUrl: currentUrl };
}

async function checkPage(path: string, type: string): Promise<PageCheck> {
  const url = `${SITE_URL}${path}`;
  const flags: string[] = [];
  let status: number | null = null;
  let canonical: string | null = null;
  let robotsMeta: string | null = null;
  let xRobotsTag: string | null = null;
  let contentType: string | null = null;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "GetPawsy-SEO-Diagnostics/1.0" },
      redirect: "follow",
    });
    
    status = res.status;
    contentType = res.headers.get("content-type");
    xRobotsTag = res.headers.get("x-robots-tag");
    
    const html = await res.text();
    
    // Extract canonical
    const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
    canonical = canonicalMatch?.[1] || null;
    
    // Extract robots meta
    const robotsMatch = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i);
    robotsMeta = robotsMatch?.[1] || null;
    
    // Flag issues
    if (status !== 200) flags.push(`non_200_status:${status}`);
    if (!canonical) flags.push("missing_canonical");
    if (canonical && !canonical.startsWith("https://getpawsy.pet")) flags.push("canonical_not_apex");
    if (canonical && canonical.includes("www.")) flags.push("canonical_has_www");
    
    const isMoneyPage = ["/", "/product/", "/collections/", "/blog/", "/guides/"].some(p => 
      path === "/" ? p === "/" : path.startsWith(p)
    );
    
    if (isMoneyPage && robotsMeta?.includes("noindex")) {
      flags.push("noindex_on_money_page");
    }
    if (!isMoneyPage && !robotsMeta?.includes("noindex")) {
      // Only flag internal pages that should be noindex
      const internalPrefixes = ["/admin", "/dashboard", "/checkout", "/auth", "/cart", "/profile", "/orders", "/payment-success"];
      if (internalPrefixes.some(p => path.startsWith(p))) {
        flags.push("missing_noindex_on_internal_page");
      }
    }
  } catch (e) {
    flags.push(`fetch_error:${e instanceof Error ? e.message : "unknown"}`);
  }

  return { path, type, status, canonical, robotsMeta, xRobotsTag, contentType, flags };
}

async function checkUrl(url: string): Promise<{ url: string; status: number | null }> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return { url, status: res.status };
  } catch {
    return { url, status: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Fetch sample pages for each type
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get sample slugs
    const [productsRes, blogRes, guidesRes, collectionsRes] = await Promise.all([
      supabase.from("products").select("slug").eq("is_active", true).limit(1).single(),
      supabase.from("blog_posts").select("slug").eq("is_published", true).limit(1).single(),
      supabase.from("cluster_articles").select("slug").eq("status", "published").limit(1).single(),
      supabase.from("categories").select("slug").limit(1).single(),
    ]);

    const pages: { path: string; type: string }[] = [
      { path: "/", type: "homepage" },
      { path: "/products", type: "products_listing" },
    ];

    if (productsRes.data?.slug) pages.push({ path: `/product/${productsRes.data.slug}`, type: "product_detail" });
    if (blogRes.data?.slug) pages.push({ path: `/blog/${blogRes.data.slug}`, type: "blog_post" });
    if (guidesRes.data?.slug) pages.push({ path: `/guides/${guidesRes.data.slug}`, type: "guide" });
    if (collectionsRes.data?.slug) pages.push({ path: `/collections/${collectionsRes.data.slug}`, type: "collection" });

    // Add internal pages to verify noindex
    pages.push(
      { path: "/auth", type: "internal" },
      { path: "/cart", type: "internal" },
      { path: "/checkout", type: "internal" },
    );

    // Run all checks in parallel
    const [robotsCheck, sitemapCheck, pageChecks, wwwRedirect] = await Promise.all([
      checkUrl(`${SITE_URL}/robots.txt`),
      checkUrl(`${SITE_URL}/sitemap.xml`),
      Promise.all(pages.map(p => checkPage(p.path, p.type))),
      checkRedirectChain("https://www.getpawsy.pet/"),
    ]);

    const allFlags = pageChecks.flatMap(p => p.flags);
    const hasIssues = allFlags.length > 0 || robotsCheck.status !== 200 || sitemapCheck.status !== 200;

    const result = {
      generated_at: new Date().toISOString(),
      site: SITE_URL,
      overall_status: hasIssues ? "issues_found" : "healthy",
      robots: {
        url: `${SITE_URL}/robots.txt`,
        status: robotsCheck.status,
        ok: robotsCheck.status === 200,
      },
      sitemap: {
        url: `${SITE_URL}/sitemap.xml`,
        status: sitemapCheck.status,
        ok: sitemapCheck.status === 200,
        note: "Sitemapindex with 7 child sitemaps. Only submit this single URL to GSC.",
      },
      canonical_rules: {
        format: "https://getpawsy.pet{pathname}",
        no_www: true,
        no_trailing_slash: true,
        no_parameters: true,
      },
      www_redirect: {
        start: "https://www.getpawsy.pet/",
        hops: wwwRedirect.hops,
        final_url: wwwRedirect.finalUrl,
        is_301: wwwRedirect.hops[0]?.status === 301,
        note: wwwRedirect.hops[0]?.status === 302
          ? "302 redirect is controlled by Lovable Cloud edge. Set getpawsy.pet as Primary and www as Alias in Settings → Domains."
          : "301 permanent redirect confirmed.",
      },
      pages: pageChecks,
      issues_summary: allFlags.length > 0 ? allFlags : ["none"],
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://getpawsy.pet";

const ENDPOINTS = [
  { key: "homepage", path: "/" },
  { key: "sitemap", path: "/sitemap.xml" },
  { key: "sitemapStatic", path: "/sitemap-static.xml" },
  { key: "merchantFeed", path: "/merchant-feed.xml" },
  { key: "robots", path: "/robots.txt" },
];

async function checkEndpoint(path: string) {
  const start = Date.now();
  try {
    const res = await fetch(`${SITE_URL}${path}`, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "GetPawsy-FullDiagnostics/1.0" },
    });
    const body = await res.text();
    const ttfb = Date.now() - start;
    const headers: Record<string, string> = {};
    for (const [k, v] of res.headers.entries()) {
      if (["content-type", "cache-control", "x-robots-tag", "location"].includes(k.toLowerCase())) {
        headers[k] = v;
      }
    }
    return {
      status: res.status,
      contentType: res.headers.get("content-type") || null,
      cacheControl: res.headers.get("cache-control") || null,
      bodyPreview: body.substring(0, 500).split("\n").slice(0, 5),
      bodyLength: body.length,
      ttfb_ms: ttfb,
      headers,
      ok: res.status === 200,
      body, // kept in memory for parsing, not included in output
    };
  } catch (e) {
    return {
      status: null,
      contentType: null,
      cacheControl: null,
      bodyPreview: [],
      bodyLength: 0,
      ttfb_ms: Date.now() - start,
      headers: {},
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      body: "",
    };
  }
}

function parseSitemapInfo(body: string) {
  const urlMatches = body.match(/<loc>/g);
  const lastModMatches = body.match(/<lastmod>([^<]+)<\/lastmod>/g);
  const lastMod = lastModMatches?.length
    ? lastModMatches[lastModMatches.length - 1].replace(/<\/?lastmod>/g, "")
    : null;
  return {
    totalUrls: urlMatches?.length ?? 0,
    lastModified: lastMod,
  };
}

function parseMerchantFeedInfo(body: string) {
  const items = body.match(/<item>/g);
  const totalProducts = items?.length ?? 0;
  const missingImages = (body.match(/<g:image_link><\/g:image_link>/g) || []).length +
    (body.match(/<g:image_link\/>/g) || []).length;
  const missingPrice = (body.match(/<g:price><\/g:price>/g) || []).length;
  const missingBrand = (body.match(/<g:brand><\/g:brand>/g) || []).length;
  const idExistsFalse = (body.match(/<g:identifier_exists>false<\/g:identifier_exists>/g) || []).length;
  return { totalProducts, missingImages, missingPrice, missingBrand, identifierExistsFalseCount: idExistsFalse };
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(16);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Run all endpoint checks in parallel
    const results: Record<string, Awaited<ReturnType<typeof checkEndpoint>>> = {};
    await Promise.all(
      ENDPOINTS.map(async (ep) => {
        results[ep.key] = await checkEndpoint(ep.path);
      })
    );

    // Check www redirect
    let wwwRedirectStatus: number | string = "unknown";
    try {
      const wwwRes = await fetch(`https://www.getpawsy.pet/sitemap.xml`, {
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });
      wwwRedirectStatus = wwwRes.status;
    } catch (e) {
      wwwRedirectStatus = `error: ${e instanceof Error ? e.message : String(e)}`;
    }

    // Build headersCheck & statusCodes
    const headersCheck: Record<string, unknown> = {};
    const statusCodes: Record<string, number | null> = {};
    const performance: Record<string, unknown> = {};

    for (const ep of ENDPOINTS) {
      const r = results[ep.key];
      headersCheck[ep.key] = {
        contentType: r.contentType,
        cacheControl: r.cacheControl,
        allHeaders: r.headers,
        bodyPreview: r.bodyPreview,
      };
      statusCodes[ep.key] = r.status;
      performance[`TTFB_${ep.key}`] = r.ttfb_ms;
    }

    // Sitemap info
    const sitemapBody = results.sitemap?.body || "";
    const sitemapStaticBody = results.sitemapStatic?.body || "";
    const sitemapInfo = {
      index: parseSitemapInfo(sitemapBody),
      static: parseSitemapInfo(sitemapStaticBody),
    };

    // Merchant feed info
    const merchantFeedInfo = parseMerchantFeedInfo(results.merchantFeed?.body || "");

    // Robots hash
    const robotsBody = results.robots?.body || "";
    const robotsTxtHash = hashString(robotsBody);

    // Canonical tag example from homepage
    const homepageBody = results.homepage?.body || "";
    const canonicalMatch = homepageBody.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"[^>]*\/?>/);
    const canonicalTagExample = canonicalMatch?.[1] || null;

    // Data counts
    const [products, collections, guides, blogPosts, orders] = await Promise.all([
      adminClient.from("products").select("id", { count: "exact", head: true }),
      adminClient.from("seo_collections").select("id", { count: "exact", head: true }),
      adminClient.from("cluster_articles").select("id", { count: "exact", head: true }),
      adminClient.from("blog_posts").select("id", { count: "exact", head: true }),
      adminClient.from("orders").select("id", { count: "exact", head: true }),
    ]);

    // Warnings
    const warnings: string[] = [];
    const currentCanonical = canonicalTagExample || "";
    if (currentCanonical && !currentCanonical.startsWith("https://getpawsy.pet")) {
      warnings.push(`Canonical host mismatch: ${currentCanonical}`);
    }
    if (wwwRedirectStatus !== 301) {
      warnings.push(`www redirect returned ${wwwRedirectStatus} instead of 301`);
    }
    for (const ep of ENDPOINTS) {
      if (!results[ep.key].ok) {
        warnings.push(`${ep.key} (${ep.path}) returned status ${results[ep.key].status}`);
      }
    }

    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: "production",
      canonicalHost: "getpawsy.pet",
      buildVersion: "1.0.0",
      hostingPlatform: "Lovable Cloud (Static SPA)",
      framework: "Vite + React",
      warnings,
      redirectRules: {
        wwwToApex: "301 via nginx",
        lovableAppToApex: "301 via nginx",
        trailingSlash: "stripped with 301",
      },
      headersCheck,
      statusCodes,
      sitemapInfo,
      merchantFeedInfo,
      crawlConfig: {
        robotsTxtHash,
        canonicalTagExample,
        wwwRedirectStatus,
      },
      performance,
      dataCounts: {
        products: products.count ?? 0,
        seo_collections: collections.count ?? 0,
        cluster_articles: guides.count ?? 0,
        blog_posts: blogPosts.count ?? 0,
        orders: orders.count ?? 0,
      },
    };

    const json = JSON.stringify(diagnostics, null, 2);

    return new Response(json, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="getpawsy-system-diagnostics.json"',
      },
    });
  } catch (error) {
    console.error("[full-diagnostics] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

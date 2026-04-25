import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple in-memory rate limit (per instance)
const rateLimitMap = new Map<string, number>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
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

    // Verify user with their token
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    // Check admin role
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: 1 per 60s per user
    const now = Date.now();
    const lastExport = rateLimitMap.get(userId) || 0;
    if (now - lastExport < 60_000) {
      return new Response(JSON.stringify({ error: "Rate limited. Try again in 60 seconds." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    rateLimitMap.set(userId, now);

    // Build ZIP
    const zip = new JSZip();
    const siteUrl = "https://getpawsy.pet";

    // --- A) system.json ---
    zip.file("diagnostics/system.json", JSON.stringify({
      generated_at: new Date().toISOString(),
      framework: "Vite + React SPA",
      runtime: "Static hosting (Lovable Cloud)",
      build_target: "ES2020 / modern browsers",
      primary_domain: "getpawsy.pet",
      www_variant: "www.getpawsy.pet",
      canonical_host: "getpawsy.pet (no www redirect, both serve same app)",
      supabase_project_id: "nojvgfbcjgipjxpfatmm",
      env_var_names: [
        "VITE_SUPABASE_URL",
        "VITE_SUPABASE_PUBLISHABLE_KEY",
        "VITE_SUPABASE_PROJECT_ID",
      ],
    }, null, 2));

    // --- B) routes.json ---
    zip.file("diagnostics/routes.json", JSON.stringify({
      public_routes: [
        "/", "/products", "/product/:slug", "/product/:slug/:variant",
        "/collections/:slug", "/category/:slug",
        "/guides", "/guides/:slug",
        "/blog", "/blog/:slug",
        "/bestsellers", "/bestsellers/:slug",
        "/cart", "/checkout", "/order-confirmation",
        "/contact", "/about", "/privacy", "/terms", "/shipping", "/returns",
      ],
      static_assets: [
        "/robots.txt", "/sitemap.xml", "/merchant-feed.xml",
        "/sitemap-static.xml", "/sitemap-products.xml",
        "/sitemap-categories.xml", "/sitemap-bestsellers.xml",
        "/sitemap-collections.xml", "/sitemap-blog.xml", "/sitemap-guides.xml",
      ],
      admin_routes: [
        "/dashboard", "/dashboard/*",
        "/admin/diagnostics", "/admin/authority-engine",
        "/admin/seo-dashboard", "/admin/seo-command-center",
        "/admin/revenue-scaling", "/admin/autonomous-seo",
      ],
      redirect_rules: "No server-side redirects. SPA catch-all serves index.html for all routes.",
      canonical_logic: "Canonical tags set client-side via react-helmet-async. Base: https://getpawsy.pet",
    }, null, 2));

    // --- B) seo/robots.txt ---
    let robotsTxt = "";
    try {
      const r = await fetch(`${siteUrl}/robots.txt`, { signal: AbortSignal.timeout(5000) });
      robotsTxt = await r.text();
    } catch (e) {
      robotsTxt = `# FETCH FAILED: ${e instanceof Error ? e.message : String(e)}`;
    }
    zip.file("diagnostics/seo/robots.txt", robotsTxt);

    // --- B) Health checks for sitemap + merchant feed ---
    const endpoints = [
      { name: "homepage", path: "/" },
      { name: "sitemap", path: "/sitemap.xml" },
      { name: "merchant_feed", path: "/merchant-feed.xml" },
      { name: "robots", path: "/robots.txt" },
    ];

    const healthResults: Record<string, unknown>[] = [];
    for (const ep of endpoints) {
      const start = Date.now();
      try {
        const r = await fetch(`${siteUrl}${ep.path}`, {
          signal: AbortSignal.timeout(10000),
          headers: { "User-Agent": "GetPawsy-Diagnostics/1.0" },
        });
        const body = await r.text();
        const elapsed = Date.now() - start;
        const headers: Record<string, string> = {};
        for (const [k, v] of r.headers.entries()) {
          if (["content-type", "cache-control", "etag", "x-cache", "cf-cache-status", "age"].includes(k.toLowerCase())) {
            headers[k] = v;
          }
        }
        healthResults.push({
          endpoint: ep.path,
          name: ep.name,
          status: r.status,
          content_type: r.headers.get("content-type"),
          response_size_bytes: body.length,
          ttfb_ms: elapsed,
          cache_headers: headers,
          first_lines: body.substring(0, 500).split("\n").slice(0, 5),
          ok: r.status === 200,
        });
      } catch (e) {
        healthResults.push({
          endpoint: ep.path,
          name: ep.name,
          status: null,
          error: e instanceof Error ? e.message : String(e),
          ttfb_ms: Date.now() - start,
          ok: false,
        });
      }
    }

    zip.file("diagnostics/health/endpoints.json", JSON.stringify(healthResults, null, 2));

    // Separate SEO health files
    const sitemapHealth = healthResults.find((h) => h.name === "sitemap");
    const feedHealth = healthResults.find((h) => h.name === "merchant_feed");
    if (sitemapHealth) zip.file("diagnostics/seo/sitemap_health.json", JSON.stringify(sitemapHealth, null, 2));
    if (feedHealth) zip.file("diagnostics/seo/merchant_feed_health.json", JSON.stringify(feedHealth, null, 2));

    // --- C) Logs ---
    // Client error logs
    const { data: clientErrors } = await adminClient
      .from("frontend_error_logs")
      .select("id, error_type, error_message, component_name, page_url, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    const errorLines = (clientErrors || []).map((e) => JSON.stringify(e)).join("\n");
    zip.file("diagnostics/logs/client_errors.jsonl", errorLines || "# No client errors recorded");

    // Cron job logs
    const { data: cronLogs } = await adminClient
      .from("cron_job_logs")
      .select("id, job_name, status, success, error_message, started_at, completed_at, items_processed, items_failed")
      .order("started_at", { ascending: false })
      .limit(200);

    const cronLines = (cronLogs || []).map((l) => 
      `[${l.started_at}] ${l.job_name} | ${l.status} | success=${l.success} | processed=${l.items_processed} | failed=${l.items_failed}${l.error_message ? ' | ERROR: ' + l.error_message : ''}`
    ).join("\n");
    zip.file("diagnostics/logs/jobs.log", cronLines || "# No cron job logs");

    // Monitoring alerts
    const { data: alerts } = await adminClient
      .from("monitoring_alerts")
      .select("id, title, severity, category, description, is_active, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    const alertLines = (alerts || []).map((a) =>
      `[${a.created_at}] [${a.severity}] ${a.title} (${a.category}) active=${a.is_active} — ${a.description?.substring(0, 200)}`
    ).join("\n");
    zip.file("diagnostics/logs/server.log", alertLines || "# No monitoring alerts");

    // --- E) Data counts ---
    const [products, collections, guides, blogPosts, orders, clusterArticles] = await Promise.all([
      adminClient.from("products").select("id", { count: "exact", head: true }),
      adminClient.from("seo_collections").select("id", { count: "exact", head: true }),
      adminClient.from("cluster_articles").select("id", { count: "exact", head: true }),
      adminClient.from("blog_posts").select("id", { count: "exact", head: true }),
      adminClient.from("orders").select("id", { count: "exact", head: true }),
      adminClient.from("cluster_articles").select("id", { count: "exact", head: true }).eq("status", "published"),
    ]);

    zip.file("diagnostics/data/counts.json", JSON.stringify({
      generated_at: new Date().toISOString(),
      products: products.count ?? 0,
      seo_collections: collections.count ?? 0,
      cluster_articles_total: guides.count ?? 0,
      cluster_articles_published: clusterArticles.count ?? 0,
      blog_posts: blogPosts.count ?? 0,
      orders: orders.count ?? 0,
    }, null, 2));

    // --- F) Redirect status ---
    let wwwRedirectStatus: number | string = "unknown";
    try {
      const wwwRes = await fetch("https://www.getpawsy.pet/sitemap.xml", {
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });
      wwwRedirectStatus = wwwRes.status;
    } catch (e) {
      wwwRedirectStatus = `error: ${e instanceof Error ? e.message : String(e)}`;
    }

    zip.file("diagnostics/redirect-status.json", JSON.stringify({
      generated_at: new Date().toISOString(),
      test_url: "https://www.getpawsy.pet/sitemap.xml",
      status: wwwRedirectStatus,
      is301: wwwRedirectStatus === 301,
      expected: 301,
      note: wwwRedirectStatus === 301
        ? "WWW correctly 301-redirects to apex"
        : "CRITICAL: www redirect is NOT 301 — SEO consolidation risk",
    }, null, 2));

    // --- G) Cache header report ---
    const cacheEndpoints = [
      { path: "/robots.txt", expectedType: "text/plain" },
      { path: "/sitemap.xml", expectedType: "text/xml" },
      { path: "/sitemap-static.xml", expectedType: "text/xml" },
      { path: "/merchant-feed.xml", expectedType: "text/xml" },
      { path: "/merchant-diagnostics.xml", expectedType: "text/xml" },
    ];
    const cacheReport: Record<string, unknown>[] = [];
    for (const ep of cacheEndpoints) {
      try {
        const r = await fetch(`${siteUrl}${ep.path}`, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        });
        cacheReport.push({
          path: ep.path,
          status: r.status,
          content_type: r.headers.get("content-type"),
          cache_control: r.headers.get("cache-control"),
          x_content_type_options: r.headers.get("x-content-type-options"),
          expected_content_type: ep.expectedType,
          ok: r.status === 200,
        });
      } catch (e) {
        cacheReport.push({ path: ep.path, error: e instanceof Error ? e.message : String(e), ok: false });
      }
    }
    zip.file("diagnostics/cache-header-report.json", JSON.stringify(cacheReport, null, 2));

    // --- H) Feed gap report ---
    const { data: allProductsForGap } = await adminClient
      .from("products")
      .select("id, name, slug, price, image_url, stock, is_active");

    let feedBodyForGap = "";
    try {
      const fr = await fetch(`${siteUrl}/merchant-feed.xml`, {
        signal: AbortSignal.timeout(15000),
      });
      feedBodyForGap = await fr.text();
    } catch { /* ignore */ }

    const feedIdSet = new Set<string>();
    const feedSlugSet = new Set<string>();
    let m2;
    const idRe = /<g:id>([^<]+)<\/g:id>/g;
    while ((m2 = idRe.exec(feedBodyForGap)) !== null) feedIdSet.add(m2[1].trim());
    const linkRe = /<link>([^<]+)<\/link>/g;
    while ((m2 = linkRe.exec(feedBodyForGap)) !== null) {
      const sm = m2[1].match(/\/product\/([^/?#]+)/);
      if (sm) feedSlugSet.add(sm[1]);
    }

    const gapProducts = (allProductsForGap || []).filter(p =>
      !feedIdSet.has(p.id) && !feedIdSet.has(p.slug) && !feedSlugSet.has(p.slug)
    ).map(p => ({
      id: p.id,
      title: p.name,
      reason: !p.is_active ? "inactive" : (p.stock !== null && p.stock <= 0) ? "out_of_stock" : !p.price ? "missing_price" : !p.image_url ? "missing_image" : "other",
      in_stock: p.stock === null || p.stock > 0,
      price: p.price,
    }));

    zip.file("diagnostics/feed-gap-report.json", JSON.stringify({
      generated_at: new Date().toISOString(),
      totalProducts: (allProductsForGap || []).length,
      inFeed: feedIdSet.size,
      missingFromFeed: gapProducts.length,
      missingProducts: gapProducts,
    }, null, 2));

    // Generate ZIP
    const zipBlob = await zip.generateAsync({ type: "uint8array" });
    const dateStr = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
    const filename = `getpawsy-diagnostics-${dateStr}.zip`;

    const zipBuffer = (zipBlob as Uint8Array).slice().buffer;
    return new Response(zipBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[export-diagnostics] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

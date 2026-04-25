import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://getpawsy.pet";

interface EndpointResult {
  status: number | null;
  contentType: string | null;
  ttfb_ms: number;
  sizeBytes: number;
  ok: boolean;
  error?: string;
  isXml?: boolean;
  isHtml?: boolean;
}

async function checkEndpoint(path: string): Promise<EndpointResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${SITE_URL}${path}`, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "GetPawsy-Monitor/1.0" },
    });
    const body = await res.text();
    const ct = res.headers.get("content-type") || "";
    return {
      status: res.status,
      contentType: ct,
      ttfb_ms: Date.now() - start,
      sizeBytes: body.length,
      ok: res.status === 200,
      isXml: ct.includes("xml") || body.trimStart().startsWith("<?xml"),
      isHtml: ct.includes("html") || body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html"),
    };
  } catch (e) {
    return {
      status: null,
      contentType: null,
      ttfb_ms: Date.now() - start,
      sizeBytes: 0,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

interface RobotsIntegrityResult {
  ok: boolean;
  missingDirectives: string[];
  bodySnippet: string;
}

async function checkRobotsIntegrity(): Promise<RobotsIntegrityResult> {
  const requiredDirectives = [
    "Sitemap: https://getpawsy.pet/sitemap.xml",
    "Disallow: /admin",
    "Disallow: /cart",
    "Disallow: /*?*gclid=",
  ];
  try {
    const res = await fetch(`${SITE_URL}/robots.txt`, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "GetPawsy-Monitor/1.0" },
    });
    const body = await res.text();
    const missing = requiredDirectives.filter(d => !body.includes(d));
    return {
      ok: missing.length === 0,
      missingDirectives: missing,
      bodySnippet: body.substring(0, 500),
    };
  } catch (e) {
    return {
      ok: false,
      missingDirectives: requiredDirectives,
      bodySnippet: `Error fetching: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

interface RedirectChainResult {
  hops: { url: string; status: number | null; location: string | null }[];
  finalStatus: number | null;
  finalUrl: string;
  hopCount: number;
  error?: string;
}

async function checkWwwRedirect(): Promise<{ status: number | null; location: string | null; error?: string }> {
  try {
    const res = await fetch("https://www.getpawsy.pet/", {
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    await res.text();
    return {
      status: res.status,
      location: res.headers.get("location"),
    };
  } catch (e) {
    return { status: null, location: null, error: e instanceof Error ? e.message : String(e) };
  }
}

async function checkRedirectChain(): Promise<RedirectChainResult> {
  const hops: RedirectChainResult["hops"] = [];
  let currentUrl = "https://www.getpawsy.pet/";
  const maxHops = 5;

  try {
    for (let i = 0; i < maxHops; i++) {
      const res = await fetch(currentUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });
      await res.text();
      const status = res.status;
      const location = res.headers.get("location");
      hops.push({ url: currentUrl, status, location });

      if (status >= 300 && status < 400 && location) {
        currentUrl = location.startsWith("http") ? location : new URL(location, currentUrl).href;
      } else {
        return { hops, finalStatus: status, finalUrl: currentUrl, hopCount: hops.length };
      }
    }
    return { hops, finalStatus: null, finalUrl: currentUrl, hopCount: hops.length, error: "Too many redirects" };
  } catch (e) {
    return { hops, finalStatus: null, finalUrl: currentUrl, hopCount: hops.length, error: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Run all checks in parallel
    const [homepage, robots, sitemap, sitemapStatic, merchantFeed, wwwRedirect, redirectChain, robotsIntegrity] = await Promise.all([
      checkEndpoint("/"),
      checkEndpoint("/robots.txt"),
      checkEndpoint("/sitemap.xml"),
      checkEndpoint("/sitemap-static.xml"),
      checkEndpoint("/merchant-feed.xml"),
      checkWwwRedirect(),
      checkRedirectChain(),
      checkRobotsIntegrity(),
    ]);

    const warnings: string[] = [];
    const resolvedIssues: string[] = [];

    // Robots integrity check
    if (!robotsIntegrity.ok) {
      warnings.push(`ROBOTS INTEGRITY FAIL: Missing directives: ${robotsIntegrity.missingDirectives.join(", ")}`);
    }

    // Check for SPA fallback issues (XML endpoint returning HTML)
    if (sitemap.ok && sitemap.isHtml) {
      warnings.push("CRITICAL: /sitemap.xml is returning HTML (SPA fallback leak)");
    }
    if (merchantFeed.ok && merchantFeed.isHtml) {
      warnings.push("CRITICAL: /merchant-feed.xml is returning HTML (SPA fallback leak)");
    }
    if (sitemapStatic.ok && sitemapStatic.isHtml) {
      warnings.push("CRITICAL: /sitemap-static.xml is returning HTML (SPA fallback leak)");
    }

    // Check status codes
    if (!homepage.ok) warnings.push(`Homepage returned ${homepage.status || 'error'}: ${homepage.error || ''}`);
    if (!robots.ok) warnings.push(`robots.txt returned ${robots.status || 'error'}`);
    if (!sitemap.ok) warnings.push(`sitemap.xml returned ${sitemap.status || 'error'}`);
    if (!merchantFeed.ok) warnings.push(`merchant-feed.xml returned ${merchantFeed.status || 'error'}`);

    // Check www redirect — must be a permanent single-hop 301.
    if (wwwRedirect.status === 421) {
      warnings.push('CRITICAL: www.getpawsy.pet returns 421 (Misdirected Request) — www hostname not bound at edge. Add www.getpawsy.pet in Settings → Domains.');
    } else if (wwwRedirect.status !== 301) {
      warnings.push(`CRITICAL: www redirect returned ${wwwRedirect.status} instead of required 301 — fix Cloudflare Redirect Rules and remove conflicting edge rules.`);
    } else {
      resolvedIssues.push('www redirect returns the required permanent 301 to apex.');
    }
    if (wwwRedirect.location && !wwwRedirect.location.includes("getpawsy.pet")) {
      warnings.push(`www redirect location unexpected: ${wwwRedirect.location}`);
    }

    // Check content types
    if (sitemap.ok && !sitemap.contentType?.includes("xml")) {
      warnings.push(`sitemap.xml has wrong content-type: ${sitemap.contentType}`);
    }
    if (merchantFeed.ok && !merchantFeed.contentType?.includes("xml")) {
      warnings.push(`merchant-feed.xml has wrong content-type: ${merchantFeed.contentType}`);
    }

    const allHealthy = warnings.length === 0;

    const results = {
      homepage: { status: homepage.status, ttfb_ms: homepage.ttfb_ms, ok: homepage.ok },
      robots: { status: robots.status, contentType: robots.contentType, sizeBytes: robots.sizeBytes, ok: robots.ok },
      sitemap: { status: sitemap.status, contentType: sitemap.contentType, sizeBytes: sitemap.sizeBytes, isXml: sitemap.isXml, ok: sitemap.ok },
      sitemapStatic: { status: sitemapStatic.status, contentType: sitemapStatic.contentType, sizeBytes: sitemapStatic.sizeBytes, ok: sitemapStatic.ok },
      merchantFeed: { status: merchantFeed.status, contentType: merchantFeed.contentType, sizeBytes: merchantFeed.sizeBytes, isXml: merchantFeed.isXml, ok: merchantFeed.ok },
      wwwRedirect: { status: wwwRedirect.status, location: wwwRedirect.location, ok: wwwRedirect.status === 301 },
      redirectChain: { hops: redirectChain.hops, finalStatus: redirectChain.finalStatus, finalUrl: redirectChain.finalUrl, hopCount: redirectChain.hopCount, error: redirectChain.error },
      robotsIntegrity: { ok: robotsIntegrity.ok, missingDirectives: robotsIntegrity.missingDirectives, bodySnippet: robotsIntegrity.bodySnippet },
    };

    // Store result
    await adminClient.from("site_health_checks").insert({
      check_type: "scheduled",
      results,
      warnings,
      all_healthy: allHealthy,
      resolved_issues: resolvedIssues,
    });

    // Cleanup old records
    await adminClient.rpc("cleanup_old_health_checks");

    return new Response(JSON.stringify({ ok: allHealthy, warnings, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[site-monitor] Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

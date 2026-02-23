const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

interface DiagnosticResult {
  name: string;
  url: string;
  status: number | null;
  valid: boolean;
  error: string | null;
  responsePreview: string;
  urlCount: number;
  hasRedirectUrls: boolean;
  hasParameterUrls: boolean;
  hasWwwUrls: boolean;
  sampleUrls: string[];
}

async function checkSitemap(url: string): Promise<DiagnosticResult> {
  const name = url.split("/").pop() || "unknown";
  try {
    const response = await fetch(url, { method: "GET" });
    const body = await response.text();

    const isXml = response.headers.get("content-type")?.includes("xml");
    const hasUrlset = body.includes("<urlset") || body.includes("<sitemapindex") || body.includes("<loc>");
    const valid = response.status === 200 && (isXml || false) && hasUrlset;

    // Extract all <loc> URLs
    const locMatches = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    const hasWwwUrls = locMatches.some(u => u.includes("www."));
    const hasParameterUrls = locMatches.some(u => u.includes("?"));
    const hasRedirectUrls = false; // Would need HEAD checks per URL

    return {
      name,
      url,
      status: response.status,
      valid,
      error: valid ? null : `Invalid: xml=${!!isXml}, urlset=${hasUrlset}, status=${response.status}`,
      responsePreview: body.substring(0, 200),
      urlCount: locMatches.length,
      hasRedirectUrls,
      hasParameterUrls,
      hasWwwUrls,
      sampleUrls: locMatches.slice(0, 5),
    };
  } catch (e) {
    return {
      name,
      url,
      status: null,
      valid: false,
      error: String(e),
      responsePreview: "",
      urlCount: 0,
      hasRedirectUrls: false,
      hasParameterUrls: false,
      hasWwwUrls: false,
      sampleUrls: [],
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SITE = "https://getpawsy.pet";
    const childSitemaps = [
      "sitemap-static.xml",
      "sitemap-products-1.xml",
      "sitemap-products-2.xml",
      "sitemap-collections.xml",
      "sitemap-clusters.xml",
      "sitemap-blog-1.xml",
      "sitemap-guides.xml",
    ];

    const results = await Promise.all([
      checkSitemap(`${SITE}/sitemap.xml`),
      ...childSitemaps.map(s => checkSitemap(`${SITE}/${s}`)),
    ]);

    const indexResult = results[0];
    const childResults = results.slice(1);

    const allValid = results.every((r) => r.valid);
    const totalUrls = childResults.reduce((sum, r) => sum + r.urlCount, 0);
    const parameterUrls = childResults.filter(r => r.hasParameterUrls).map(r => r.name);
    const wwwUrls = childResults.filter(r => r.hasWwwUrls).map(r => r.name);
    const brokenSitemaps = results.filter(r => !r.valid).map(r => r.name);

    const summary = {
      timestamp: new Date().toISOString(),
      healthy: allValid,
      validation_summary: {
        total_urls_checked: totalUrls,
        broken_sitemaps: brokenSitemaps,
        sitemaps_with_parameter_urls: parameterUrls,
        sitemaps_with_www_urls: wwwUrls,
        all_use_apex_https: wwwUrls.length === 0 && parameterUrls.length === 0,
      },
      sitemap_index: {
        url: indexResult.url,
        status: indexResult.status,
        valid: indexResult.valid,
        child_count: indexResult.urlCount,
      },
      child_sitemaps: childResults.map(r => ({
        name: r.name,
        status: r.status,
        valid: r.valid,
        url_count: r.urlCount,
        has_parameter_urls: r.hasParameterUrls,
        has_www_urls: r.hasWwwUrls,
        sample_urls: r.sampleUrls,
        error: r.error,
      })),
      recommendation: allValid
        ? "All 7 child sitemaps + index healthy. Submit only https://getpawsy.pet/sitemap.xml to GSC."
        : `Issues found in: ${brokenSitemaps.join(", ")}. Fix before submitting to GSC.`,
      notes: [
        "Bestseller detail pages (/bestseller/:slug) are noindex by design — they canonical to /product/:slug",
        "Priority weights: Homepage 1.0, Products 0.95, Bestsellers 0.90, Guides 0.85, Categories 0.85, Blog 0.60",
      ],
    };

    return new Response(JSON.stringify(summary, null, 2), {
      headers: corsHeaders,
      status: 200,
    });
  } catch (e) {
    console.error("[sitemap-diagnostics] error:", e);
    return new Response(
      JSON.stringify({
        error: String(e),
        timestamp: new Date().toISOString(),
      }),
      { headers: corsHeaders, status: 500 }
    );
  }
});

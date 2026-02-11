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
}

async function checkSitemap(url: string): Promise<DiagnosticResult> {
  const name = url.split("/").pop() || "unknown";
  try {
    const response = await fetch(url, { method: "GET" });
    const body = await response.text();

    const valid =
      response.status === 200 &&
      response.headers.get("content-type")?.includes("xml") &&
      (body.includes("<urlset") ||
        body.includes("<sitemapindex") ||
        body.includes("<loc>"));

    return {
      name,
      url,
      status: response.status,
      valid,
      error: valid ? null : "Invalid XML or wrong content-type",
      responsePreview: body.substring(0, 200),
    };
  } catch (e) {
    return {
      name,
      url,
      status: null,
      valid: false,
      error: String(e),
      responsePreview: "",
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const results = await Promise.all([
      checkSitemap("https://getpawsy.pet/sitemap.xml"),
      checkSitemap("https://getpawsy.pet/sitemap-guides.xml"),
      checkSitemap("https://getpawsy.pet/sitemap-products.xml"),
    ]);

    const allValid = results.every((r) => r.valid);
    const summary = {
      timestamp: new Date().toISOString(),
      healthy: allValid,
      checks: results,
      recommendation: allValid
        ? "All sitemaps healthy. Submit https://getpawsy.pet/sitemap.xml to GSC."
        : "Some sitemaps failed. See details above.",
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

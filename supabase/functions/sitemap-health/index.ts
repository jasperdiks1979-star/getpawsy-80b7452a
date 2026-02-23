const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SITE = "https://getpawsy.pet";

const SITEMAP_ENDPOINTS = [
  { name: "sitemap-index.xml", expectedRoot: "sitemapindex" },
  { name: "sitemap-static.xml", expectedRoot: "urlset" },
  { name: "sitemap-products-1.xml", expectedRoot: "urlset" },
  { name: "sitemap-products-2.xml", expectedRoot: "urlset" },
  { name: "sitemap-collections.xml", expectedRoot: "urlset" },
  { name: "sitemap-clusters.xml", expectedRoot: "urlset" },
  { name: "sitemap-blog-1.xml", expectedRoot: "urlset" },
  { name: "sitemap-guides.xml", expectedRoot: "urlset" },
];

interface EndpointResult {
  name: string;
  url: string;
  status: number | null;
  contentType: string | null;
  isXml: boolean;
  hasHtml: boolean;
  hasScriptTags: boolean;
  hasMetaTags: boolean;
  xmlDeclaration: boolean;
  correctRoot: boolean;
  urlCount: number;
  hasLastmod: boolean;
  hasWwwUrls: boolean;
  hasParameterUrls: boolean;
  hasDuplicateUrls: boolean;
  hasRedirectUrls: boolean;
  sampleUrls: string[];
  responseSize: number;
  error: string | null;
  valid: boolean;
}

async function validateEndpoint(
  name: string,
  expectedRoot: string
): Promise<EndpointResult> {
  const url = `${SITE}/${name}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "PawsySitemapHealthBot/1.0" },
      redirect: "follow",
    });

    const body = await res.text();
    const ct = res.headers.get("content-type") || "";

    const isXml = ct.includes("xml");
    const hasHtml = /<html[\s>]/i.test(body) || /<!DOCTYPE html/i.test(body);
    const hasScriptTags = /<script[\s>]/i.test(body);
    const hasMetaTags = /<meta[\s]/i.test(body) && !body.includes('<?xml');
    const xmlDeclaration = body.trimStart().startsWith("<?xml");
    const correctRoot = body.includes(`<${expectedRoot}`);

    // Extract <loc> URLs
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const uniqueLocs = new Set(locs);
    const hasWwwUrls = locs.some((u) => u.includes("www."));
    const hasParameterUrls = locs.some((u) => u.includes("?"));
    const hasDuplicateUrls = locs.length !== uniqueLocs.size;
    const hasLastmod = body.includes("<lastmod>");

    const valid =
      res.status === 200 &&
      isXml &&
      !hasHtml &&
      !hasScriptTags &&
      xmlDeclaration &&
      correctRoot &&
      !hasWwwUrls &&
      !hasParameterUrls;

    return {
      name,
      url,
      status: res.status,
      contentType: ct,
      isXml,
      hasHtml,
      hasScriptTags,
      hasMetaTags,
      xmlDeclaration,
      correctRoot,
      urlCount: locs.length,
      hasLastmod,
      hasWwwUrls,
      hasParameterUrls,
      hasDuplicateUrls,
      hasRedirectUrls: false,
      sampleUrls: locs.slice(0, 3),
      responseSize: body.length,
      error: null,
      valid,
    };
  } catch (e) {
    return {
      name,
      url,
      status: null,
      contentType: null,
      isXml: false,
      hasHtml: false,
      hasScriptTags: false,
      hasMetaTags: false,
      xmlDeclaration: false,
      correctRoot: false,
      urlCount: 0,
      hasLastmod: false,
      hasWwwUrls: false,
      hasParameterUrls: false,
      hasDuplicateUrls: false,
      hasRedirectUrls: false,
      sampleUrls: [],
      responseSize: 0,
      error: String(e),
      valid: false,
    };
  }
}

async function validateRobotsTxt(): Promise<{
  status: number | null;
  contentType: string | null;
  hasSitemapRef: boolean;
  sitemapUrl: string | null;
  hasWwwRef: boolean;
  hasLovableRef: boolean;
  valid: boolean;
  error: string | null;
}> {
  try {
    const res = await fetch(`${SITE}/robots.txt`);
    const body = await res.text();
    const ct = res.headers.get("content-type") || "";
    const sitemapMatch = body.match(/^Sitemap:\s*(.+)$/m);
    const sitemapUrl = sitemapMatch ? sitemapMatch[1].trim() : null;

    return {
      status: res.status,
      contentType: ct,
      hasSitemapRef: !!sitemapUrl,
      sitemapUrl,
      hasWwwRef: body.includes("www.getpawsy") || body.includes("www.lovable"),
      hasLovableRef: body.includes("lovable.app"),
      valid:
        res.status === 200 &&
        ct.includes("text/plain") &&
        !!sitemapUrl &&
        sitemapUrl.includes("sitemap-index.xml") &&
        !body.includes("lovable.app"),
      error: null,
    };
  } catch (e) {
    return {
      status: null,
      contentType: null,
      hasSitemapRef: false,
      sitemapUrl: null,
      hasWwwRef: false,
      hasLovableRef: false,
      valid: false,
      error: String(e),
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const [sitemapResults, robotsResult] = await Promise.all([
      Promise.all(
        SITEMAP_ENDPOINTS.map((ep) => validateEndpoint(ep.name, ep.expectedRoot))
      ),
      validateRobotsTxt(),
    ]);

    const validCount = sitemapResults.filter((r) => r.valid).length;
    const totalEndpoints = sitemapResults.length;
    const totalUrls = sitemapResults
      .filter((r) => r.name !== "sitemap-index.xml")
      .reduce((sum, r) => sum + r.urlCount, 0);

    // Crawl integrity score (0–100)
    let score = 0;
    // +50 for all sitemaps valid
    score += (validCount / totalEndpoints) * 50;
    // +15 for robots.txt valid
    if (robotsResult.valid) score += 15;
    // +10 for no HTML in any sitemap
    if (sitemapResults.every((r) => !r.hasHtml)) score += 10;
    // +10 for no parameter URLs
    if (sitemapResults.every((r) => !r.hasParameterUrls)) score += 10;
    // +10 for no www URLs
    if (sitemapResults.every((r) => !r.hasWwwUrls)) score += 10;
    // +5 for no duplicates
    if (sitemapResults.every((r) => !r.hasDuplicateUrls)) score += 5;

    score = Math.round(Math.min(100, score));

    const stabilityLevel =
      score >= 90
        ? "Enterprise"
        : score >= 70
        ? "High"
        : score >= 50
        ? "Medium"
        : "Low";

    const issues: string[] = [];
    for (const r of sitemapResults) {
      if (!r.valid) {
        const reasons: string[] = [];
        if (r.status !== 200) reasons.push(`HTTP ${r.status}`);
        if (!r.isXml) reasons.push("wrong content-type");
        if (r.hasHtml) reasons.push("contains HTML");
        if (r.hasScriptTags) reasons.push("contains <script>");
        if (!r.xmlDeclaration) reasons.push("missing XML declaration");
        if (!r.correctRoot) reasons.push("wrong root element");
        if (r.hasWwwUrls) reasons.push("contains www URLs");
        if (r.hasParameterUrls) reasons.push("contains parameter URLs");
        issues.push(`${r.name}: ${reasons.join(", ")}`);
      }
    }

    return new Response(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          crawl_integrity_score: score,
          stability_level: stabilityLevel,
          summary: {
            total_endpoints: totalEndpoints,
            valid_endpoints: validCount,
            total_urls_across_sitemaps: totalUrls,
            issues,
          },
          robots_txt: robotsResult,
          sitemaps: sitemapResults,
          curl_verification: [
            `curl -I ${SITE}/sitemap-index.xml`,
            `curl -I ${SITE}/sitemap-blog-1.xml`,
            `curl -I ${SITE}/robots.txt`,
          ],
        },
        null,
        2
      ),
      { headers: corsHeaders, status: 200 }
    );
  } catch (e) {
    console.error("[sitemap-health] error:", e);
    return new Response(
      JSON.stringify({ error: String(e), timestamp: new Date().toISOString() }),
      { headers: corsHeaders, status: 500 }
    );
  }
});

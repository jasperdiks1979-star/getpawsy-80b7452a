import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Hop {
  status: number;
  url: string;
  location: string | null;
  server: string | null;
  cfRay: string | null;
  cacheControl: string | null;
  cfCacheStatus: string | null;
  contentType: string | null;
}

interface CheckResult {
  target: string;
  label: string;
  hops: Hop[];
  finalUrl: string;
  finalStatus: number;
  pass: boolean;
  failReason: string | null;
  severity: "ok" | "warning" | "critical";
  checkedAt: string;
}

interface HeaderCheck {
  url: string;
  label: string;
  status: number;
  cacheControl: string | null;
  contentType: string | null;
  expectedCacheControl: string;
  pass: boolean;
  failReason: string | null;
}

async function followRedirects(url: string, maxHops = 5): Promise<Hop[]> {
  const hops: Hop[] = [];
  let currentUrl = url;

  for (let i = 0; i < maxHops; i++) {
    try {
      const res = await fetch(currentUrl, {
        method: "HEAD",
        redirect: "manual",
        headers: { "User-Agent": "GetPawsy-DomainHealthCheck/1.0" },
        signal: AbortSignal.timeout(8000),
      });

      const location = res.headers.get("location");
      hops.push({
        status: res.status,
        url: currentUrl,
        location,
        server: res.headers.get("server"),
        cfRay: res.headers.get("cf-ray"),
        cacheControl: res.headers.get("cache-control"),
        cfCacheStatus: res.headers.get("cf-cache-status"),
        contentType: res.headers.get("content-type"),
      });

      if (res.status < 300 || res.status >= 400 || !location) break;
      currentUrl = new URL(location, currentUrl).href;
    } catch {
      hops.push({ status: 0, url: currentUrl, location: null, server: null, cfRay: null, cacheControl: null, cfCacheStatus: null, contentType: null });
      break;
    }
  }
  return hops;
}

function assessRedirect(label: string, target: string, hops: Hop[], expectApex = true): CheckResult {
  const first = hops[0];
  const last = hops[hops.length - 1];
  const firstIs301 = first.status === 301 || first.status === 308;
  const landsOnApex = expectApex ? last.url.startsWith("https://getpawsy.pet") && last.status === 200 : last.status === 200;
  const hasChain = hops.filter(h => h.status >= 300 && h.status < 400).length > 1;

  let failReason: string | null = null;
  let severity: "ok" | "warning" | "critical" = "ok";

  if (!firstIs301) {
    failReason = `First hop is ${first.status} (expected 301/308). Server: ${first.server || "?"}. Fix: Set getpawsy.pet as Primary, www as Alias in Project Settings → Domains.`;
    severity = first.status === 302 ? "warning" : "critical";
  } else if (!landsOnApex) {
    failReason = `Final URL is ${last.url} (expected https://getpawsy.pet)`;
    severity = "critical";
  } else if (hasChain) {
    failReason = `Multi-hop redirect chain detected (${hops.length} hops). Should be single-hop 301.`;
    severity = "warning";
  }

  return {
    target, label, hops,
    finalUrl: last.url, finalStatus: last.status,
    pass: firstIs301 && landsOnApex && !hasChain,
    failReason, severity,
    checkedAt: new Date().toISOString(),
  };
}

async function checkHeaders(url: string, label: string, expectedCC: string): Promise<HeaderCheck> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": "GetPawsy-HeaderCheck/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    const cc = res.headers.get("cache-control");
    const ct = res.headers.get("content-type");
    const pass = cc !== null && cc.toLowerCase().includes("public");
    return { url, label, status: res.status, cacheControl: cc, contentType: ct, expectedCacheControl: expectedCC, pass, failReason: pass ? null : `Cache-Control is ${cc || "null"}, expected "${expectedCC}"` };
  } catch (e) {
    return { url, label, status: 0, cacheControl: null, contentType: null, expectedCacheControl: expectedCC, pass: false, failReason: `Fetch failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // === REDIRECT CHECKS ===
    const [apexHops, wwwHops, lovableHops, wwwSitemapHops, wwwDeepHops] = await Promise.all([
      followRedirects("https://getpawsy.pet"),
      followRedirects("https://www.getpawsy.pet"),
      followRedirects("https://getpawsy.lovable.app"),
      followRedirects("https://www.getpawsy.pet/sitemap.xml"),
      followRedirects("https://www.getpawsy.pet/collections/cat-enrichment?ref=test&utm_source=audit"),
    ]);

    const redirectResults: CheckResult[] = [
      // Apex should return 200 directly
      (() => {
        const last = apexHops[apexHops.length - 1];
        return {
          target: "https://getpawsy.pet",
          label: "Apex (getpawsy.pet)",
          hops: apexHops,
          finalUrl: last.url, finalStatus: last.status,
          pass: last.status === 200,
          failReason: last.status === 200 ? null : `Expected 200, got ${last.status}`,
          severity: last.status === 200 ? "ok" as const : "critical" as const,
          checkedAt: new Date().toISOString(),
        };
      })(),
      assessRedirect("WWW → Apex", "https://www.getpawsy.pet", wwwHops),
      assessRedirect("Lovable.app → Apex", "https://getpawsy.lovable.app", lovableHops),
      assessRedirect("WWW Sitemap → Apex Sitemap", "https://www.getpawsy.pet/sitemap.xml", wwwSitemapHops),
      assessRedirect("WWW Deep Path + Query → Apex (preserves path)", "https://www.getpawsy.pet/collections/cat-enrichment?ref=test&utm_source=audit", wwwDeepHops),
    ];

    // === HEADER CHECKS ===
    const headerChecks = await Promise.all([
      checkHeaders("https://getpawsy.pet/", "Homepage (HTML)", "public, max-age=0, must-revalidate"),
      checkHeaders("https://getpawsy.pet/robots.txt", "robots.txt", "public, max-age=3600"),
      checkHeaders("https://getpawsy.pet/sitemap.xml", "sitemap.xml", "public, max-age=3600"),
      checkHeaders("https://getpawsy.pet/sitemap-static.xml", "sitemap-static.xml", "public, max-age=3600"),
      checkHeaders("https://getpawsy.pet/merchant-feed.xml", "merchant-feed.xml", "public, max-age=1800"),
    ]);

    // === SEO GATE ===
    const redirectFailures = redirectResults.filter(r => !r.pass);
    const headerFailures = headerChecks.filter(h => !h.pass);
    const has302 = redirectResults.some(r => r.hops.some(h => h.status === 302));
    const seoGate = {
      pass: redirectFailures.length === 0 && !has302,
      redirectsPass: redirectFailures.length === 0,
      headersPass: headerFailures.length === 0,
      has302Warning: has302,
      failingSummary: [
        ...redirectFailures.map(r => `REDIRECT: ${r.label} — ${r.failReason}`),
        ...headerFailures.map(h => `HEADER: ${h.label} — ${h.failReason}`),
      ],
    };

    return new Response(JSON.stringify({
      redirectResults,
      headerChecks,
      seoGate,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

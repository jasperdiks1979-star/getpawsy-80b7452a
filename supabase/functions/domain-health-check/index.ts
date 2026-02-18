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
}

interface CheckResult {
  target: string;
  label: string;
  hops: Hop[];
  finalUrl: string;
  finalStatus: number;
  pass: boolean;
  failReason: string | null;
  checkedAt: string;
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
      });

      const location = res.headers.get("location");
      const hop: Hop = {
        status: res.status,
        url: currentUrl,
        location,
        server: res.headers.get("server"),
        cfRay: res.headers.get("cf-ray"),
        cacheControl: res.headers.get("cache-control"),
        cfCacheStatus: res.headers.get("cf-cache-status"),
      };
      hops.push(hop);

      // If not a redirect, we're done
      if (res.status < 300 || res.status >= 400 || !location) {
        break;
      }

      // Resolve relative location
      currentUrl = new URL(location, currentUrl).href;
    } catch (err) {
      hops.push({
        status: 0,
        url: currentUrl,
        location: null,
        server: null,
        cfRay: null,
        cacheControl: null,
        cfCacheStatus: null,
      });
      break;
    }
  }

  return hops;
}

function checkApex(hops: Hop[]): CheckResult {
  const last = hops[hops.length - 1];
  const pass = last.status === 200;
  return {
    target: "https://getpawsy.pet",
    label: "Apex (getpawsy.pet)",
    hops,
    finalUrl: last.url,
    finalStatus: last.status,
    pass,
    failReason: pass ? null : `Expected 200, got ${last.status}`,
    checkedAt: new Date().toISOString(),
  };
}

function checkWww(hops: Hop[]): CheckResult {
  const first = hops[0];
  const last = hops[hops.length - 1];
  const firstIs301 = first.status === 301;
  const landsOnApex = last.url.startsWith("https://getpawsy.pet") && last.status === 200;

  let failReason: string | null = null;
  if (!firstIs301) {
    failReason = `Hop 1 is ${first.status} (expected 301). ${first.server ? `Server: ${first.server}` : ""} ${first.cfRay ? `CF-Ray: ${first.cfRay}` : ""}. Fix: Set getpawsy.pet as Primary and www as Alias in Project Settings → Domains. Use DNS-only (grey cloud) if Cloudflare.`;
  } else if (!landsOnApex) {
    failReason = `Final URL is ${last.url} (expected https://getpawsy.pet)`;
  }

  return {
    target: "https://www.getpawsy.pet",
    label: "WWW → Apex",
    hops,
    finalUrl: last.url,
    finalStatus: last.status,
    pass: firstIs301 && landsOnApex,
    failReason,
    checkedAt: new Date().toISOString(),
  };
}

function checkLovableApp(hops: Hop[]): CheckResult {
  const first = hops[0];
  const last = hops[hops.length - 1];
  const firstIs301 = first.status === 301;
  const landsOnApex = last.url.startsWith("https://getpawsy.pet") && last.status === 200;

  let failReason: string | null = null;
  if (!firstIs301) {
    failReason = `Hop 1 is ${first.status} (expected 301). Fix: Ensure lovable.app domain redirects to apex in Project Settings → Domains.`;
  } else if (!landsOnApex) {
    failReason = `Final URL is ${last.url} (expected https://getpawsy.pet)`;
  }

  return {
    target: "https://getpawsy.lovable.app",
    label: "Lovable.app → Apex",
    hops,
    finalUrl: last.url,
    finalStatus: last.status,
    pass: firstIs301 && landsOnApex,
    failReason,
    checkedAt: new Date().toISOString(),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const [apexHops, wwwHops, lovableHops] = await Promise.all([
      followRedirects("https://getpawsy.pet"),
      followRedirects("https://www.getpawsy.pet"),
      followRedirects("https://getpawsy.lovable.app"),
    ]);

    const results: CheckResult[] = [
      checkApex(apexHops),
      checkWww(wwwHops),
      checkLovableApp(lovableHops),
    ];

    return new Response(JSON.stringify({ results, timestamp: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

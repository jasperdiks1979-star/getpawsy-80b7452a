import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Content-Type": "application/json",
};

const SITE = "https://getpawsy.pet";
const INDEXNOW_KEY = "e8f4a2b1c9d7e6f5a3b2c1d0e9f8a7b6";
const PING_TIMEOUT_MS = 10_000;

interface AcceleratorResult {
  url: string;
  indexnow: boolean;
  google: boolean;
  validations: {
    hasCanonical: boolean;
    noNoindex: boolean;
    hasContent: boolean;
    httpStatus: number | null;
  };
}

/** Fetch with timeout */
async function fetchTimeout(url: string, init: RequestInit = {}, ms = PING_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/** Validate page indexability */
async function validatePage(url: string): Promise<AcceleratorResult["validations"]> {
  try {
    const res = await fetchTimeout(url, { method: "GET" }, 15_000);
    const html = await res.text();
    return {
      httpStatus: res.status,
      hasCanonical: html.includes('rel="canonical"') || html.includes("rel='canonical'"),
      noNoindex: !html.includes('noindex'),
      hasContent: html.length > 500 && (html.includes('<h1') || html.includes('<article')),
    };
  } catch {
    return { httpStatus: null, hasCanonical: false, noNoindex: true, hasContent: false };
  }
}

/** Ping IndexNow for a batch of URLs */
async function pingIndexNow(urls: string[]): Promise<boolean> {
  try {
    const res = await fetchTimeout("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: "getpawsy.pet",
        key: INDEXNOW_KEY,
        keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
        urlList: urls.slice(0, 100),
      }),
    });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

/** Ping Google Indexing API for a single URL */
async function pingGoogleIndexing(url: string): Promise<boolean> {
  const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!saJson) return false;

  try {
    const sa = JSON.parse(saJson);
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
      .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const payload = btoa(JSON.stringify({
      iss: sa.client_email, scope: "https://www.googleapis.com/auth/indexing",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
    })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

    const pemContent = sa.private_key.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\n/g, "");
    const binaryKey = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(`${header}.${payload}`));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const jwt = `${header}.${payload}.${sigB64}`;

    const tokenRes = await fetchTimeout("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });
    if (!tokenRes.ok) return false;
    const { access_token } = await tokenRes.json();

    const indexRes = await fetchTimeout("https://indexing.googleapis.com/v3/urlNotifications:publish", {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, type: "URL_UPDATED" }),
    });
    return indexRes.ok;
  } catch {
    return false;
  }
}

// NOTE: Google/Bing sitemap ping endpoints are DEPRECATED (return 404/410).
// Discovery happens via IndexNow + Google Indexing API + robots.txt Sitemap directive.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const action = body.action || "accelerate"; // accelerate | report | validate-batch

    if (action === "report") {
      // Return indexation health report
      const { data: guides } = await supabase
        .from("published_guides")
        .select("slug, is_published, is_indexed, indexed_at, published_at")
        .eq("is_published", true)
        .order("published_at", { ascending: false })
        .limit(200);

      const { data: pingLogs } = await supabase
        .from("cron_job_logs")
        .select("*")
        .eq("job_name", "indexnow-ping")
        .order("created_at", { ascending: false })
        .limit(20);

      const totalGuides = guides?.length || 0;
      const indexedGuides = guides?.filter(g => g.is_indexed)?.length || 0;
      const unindexedGuides = guides?.filter(g => !g.is_indexed) || [];

      return new Response(JSON.stringify({
        ok: true,
        report: {
          totalGuides,
          indexedGuides,
          unindexedGuides: unindexedGuides.length,
          unindexedSlugs: unindexedGuides.slice(0, 20).map(g => g.slug),
          recentPings: pingLogs?.slice(0, 10) || [],
          generatedAt: new Date().toISOString(),
        },
      }), { headers: corsHeaders });
    }

    if (action === "validate-batch") {
      // Validate a batch of URLs for indexability issues
      const urls: string[] = body.urls || [];
      const results = await Promise.allSettled(
        urls.slice(0, 20).map(async (url: string) => {
          const fullUrl = url.startsWith("http") ? url : `${SITE}${url}`;
          const v = await validatePage(fullUrl);
          return { url: fullUrl, ...v };
        })
      );

      const validations = results.map(r =>
        r.status === "fulfilled" ? r.value : { url: "unknown", httpStatus: null, hasCanonical: false, noNoindex: false, hasContent: false }
      );

      const issues = validations.filter(v => !v.hasCanonical || !v.noNoindex || !v.hasContent || v.httpStatus !== 200);

      return new Response(JSON.stringify({
        ok: true,
        total: validations.length,
        healthy: validations.length - issues.length,
        issues: issues.length,
        details: validations,
      }), { headers: corsHeaders });
    }

    // === ACCELERATE ACTION ===
    // Accept URLs or slugs to accelerate indexing
    let urls: string[] = body.urls || [];
    const slugs: string[] = body.slugs || [];

    // Convert slugs to full URLs
    for (const slug of slugs) {
      urls.push(`${SITE}/guides/${slug}`);
    }

    // If no specific URLs, find recently published unindexed guides
    if (urls.length === 0) {
      const { data: unindexed } = await supabase
        .from("published_guides")
        .select("slug")
        .eq("is_published", true)
        .eq("is_indexed", false)
        .order("published_at", { ascending: false })
        .limit(10);

      if (unindexed?.length) {
        urls = unindexed.map(g => `${SITE}/guides/${g.slug}`);
      }
    }

    if (urls.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No URLs to accelerate — all guides indexed." }), { headers: corsHeaders });
    }

    // Execute all acceleration steps in parallel (no deprecated sitemap pings)
    const [indexNowOk, ...googleResults] = await Promise.allSettled([
      pingIndexNow(urls),
      ...urls.slice(0, 5).map(url => pingGoogleIndexing(url)),
    ]);

    // Validate pages in parallel
    const validationResults = await Promise.allSettled(
      urls.slice(0, 10).map(url => validatePage(url))
    );

    const results: AcceleratorResult[] = urls.slice(0, 10).map((url, i) => ({
      url,
      indexnow: indexNowOk.status === "fulfilled" ? indexNowOk.value : false,
      google: i < googleResults.length && googleResults[i].status === "fulfilled" ? googleResults[i].value : false,
      validations: validationResults[i]?.status === "fulfilled"
        ? validationResults[i].value
        : { httpStatus: null, hasCanonical: false, noNoindex: true, hasContent: false },
    }));

    // Mark guides as indexed
    const guideSlugs = urls
      .filter(u => u.includes("/guides/"))
      .map(u => u.split("/guides/")[1]);

    if (guideSlugs.length > 0) {
      await supabase
        .from("published_guides")
        .update({ is_indexed: true, indexed_at: new Date().toISOString() })
        .in("slug", guideSlugs);
    }

    // Log the acceleration run
    const issueCount = results.filter(r =>
      !r.validations.hasCanonical || !r.validations.noNoindex || !r.validations.hasContent || r.validations.httpStatus !== 200
    ).length;

    try {
      await supabase.from("cron_job_logs").insert({
        job_name: "indexation-accelerator",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        success: issueCount === 0,
        items_processed: urls.length,
        items_failed: issueCount,
        details: {
          urls: urls.slice(0, 20),
          indexnow: indexNowOk.status === "fulfilled" ? indexNowOk.value : false,
          issues: results.filter(r => r.validations.httpStatus !== 200).map(r => r.url),
        },
      });
    } catch { /* non-blocking */ }

    return new Response(JSON.stringify({
      ok: true,
      accelerated: urls.length,
      results,
      summary: {
        indexNowPinged: indexNowOk.status === "fulfilled" ? indexNowOk.value : false,
        googleIndexingPinged: googleResults.filter(r => r.status === "fulfilled" && r.value).length,
        validationIssues: issueCount,
        totalUrls: urls.length,
      },
    }), { headers: corsHeaders });
  } catch (err) {
    console.error("[indexation-accelerator] error:", err);
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
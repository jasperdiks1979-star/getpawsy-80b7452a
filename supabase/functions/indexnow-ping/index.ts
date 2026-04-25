import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INDEXNOW_ENDPOINTS = [
  "https://api.indexnow.org/indexnow",
  "https://www.bing.com/indexnow",
  "https://yandex.com/indexnow",
];

const BASE_URL = "https://getpawsy.pet";
const INDEXNOW_KEY = "e8f4a2b1c9d7e6f5a3b2c1d0e9f8a7b6";
const GOOGLE_INDEXING_API = "https://indexing.googleapis.com/v3/urlNotifications:publish";
const REQUEST_TIMEOUT_MS = 10_000;

interface PingRequest {
  urls?: string[];
  url?: string;
  productId?: string;
  blogSlug?: string;
  type?: "product" | "blog" | "category" | "sitemap" | "all";
}

interface PingResult {
  engine: string;
  success: boolean;
  status?: number;
  error?: string;
  urlsProcessed?: number;
}

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri: string;
}

/** Create an AbortSignal that fires after `ms` milliseconds */
function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/** Fetch with a hard timeout — resolves or rejects, never hangs */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const { signal, clear } = timeoutSignal(timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal });
    clear();
    return res;
  } catch (e) {
    clear();
    throw e;
  }
}

async function generateGoogleJWT(credentials: ServiceAccountCredentials): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/indexing",
    aud: credentials.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const pemContents = credentials.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, encoder.encode(unsignedToken));
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return `${unsignedToken}.${signatureB64}`;
}

async function getGoogleAccessToken(credentials: ServiceAccountCredentials): Promise<string | null> {
  try {
    const jwt = await generateGoogleJWT(credentials);
    const response = await fetchWithTimeout(credentials.token_uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      console.error("Failed to get Google access token:", await response.text());
      return null;
    }
    const data = await response.json();
    return data.access_token;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isTimeout = msg.includes("abort") || msg.includes("signal");
    console.error(`Google access token ${isTimeout ? "timeout" : "error"}:`, msg);
    return null;
  }
}

async function pingGoogleIndexingAPI(urls: string[]): Promise<PingResult> {
  const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!serviceAccountJson) {
    return { engine: "Google Indexing API", success: false, error: "GOOGLE_SERVICE_ACCOUNT_JSON not configured" };
  }

  try {
    const credentials: ServiceAccountCredentials = JSON.parse(serviceAccountJson);
    const accessToken = await getGoogleAccessToken(credentials);
    if (!accessToken) {
      return { engine: "Google Indexing API", success: false, error: "Failed to obtain access token" };
    }

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];
    const urlsToProcess = urls.slice(0, 200);

    // Use Promise.allSettled to ensure no dangling promises
    const results = await Promise.allSettled(
      urlsToProcess.map(async (url) => {
        try {
          const response = await fetchWithTimeout(GOOGLE_INDEXING_API, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ url, type: "URL_UPDATED" }),
          });

          if (response.ok) {
            return { url, ok: true };
          } else {
            const errorText = await response.text().catch(() => "unknown");
            return { url, ok: false, error: `${response.status} - ${errorText.substring(0, 100)}` };
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          const isTimeout = msg.includes("abort") || msg.includes("signal");
          return { url, ok: false, error: isTimeout ? "timeout" : msg };
        }
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value.ok) {
        successCount++;
      } else {
        failCount++;
        const errDetail = r.status === "fulfilled" ? r.value.error : r.reason?.message;
        if (errors.length < 5) errors.push(`${errDetail}`);
      }
    }

    return {
      engine: "Google Indexing API",
      success: successCount > 0,
      status: successCount > 0 ? 200 : 500,
      urlsProcessed: successCount,
      error: errors.length > 0 ? `${failCount} failed: ${errors.join("; ")}` : undefined,
    };
  } catch (error) {
    return {
      engine: "Google Indexing API",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function pingIndexNow(urls: string[]): Promise<PingResult[]> {
  const body = {
    host: "getpawsy.pet",
    key: INDEXNOW_KEY,
    keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
    urlList: urls.slice(0, 10000),
  };

  // Use Promise.allSettled — every endpoint resolves individually
  const settled = await Promise.allSettled(
    INDEXNOW_ENDPOINTS.map(async (endpoint) => {
      const engineName = endpoint.includes("bing") ? "Bing" :
                         endpoint.includes("yandex") ? "Yandex" : "IndexNow API";
      try {
        const response = await fetchWithTimeout(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        return {
          engine: engineName,
          success: response.status >= 200 && response.status < 300,
          status: response.status,
        } as PingResult;
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        const isTimeout = msg.includes("abort") || msg.includes("signal");
        return {
          engine: engineName,
          success: false,
          error: isTimeout ? "timeout (10s)" : msg,
        } as PingResult;
      }
    })
  );

  return settled.map(s => s.status === "fulfilled" ? s.value : {
    engine: "Unknown",
    success: false,
    error: s.reason?.message || "promise rejected",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let urls: string[] = [];
    let pingType = "manual";

    if (req.method === "POST") {
      const body: PingRequest = await req.json();

      if (body.urls && body.urls.length > 0) {
        urls = body.urls.map((url: string) => url.startsWith("http") ? url : `${BASE_URL}${url}`);
        pingType = "direct";
      } else if (body.url && typeof body.url === "string") {
        urls = [body.url.startsWith("http") ? body.url : `${BASE_URL}${body.url}`];
        pingType = "direct";
      } else if (body.productId) {
        const { data: product } = await supabase
          .from("products")
          .select("slug, id")
          .eq("id", body.productId)
          .single();

        if (product) {
          const productPath = product.slug || product.id;
          urls = [`${BASE_URL}/product/${productPath}`];
          pingType = "product";
        }
      } else if (body.blogSlug) {
        urls = [`${BASE_URL}/blog/${body.blogSlug}`];
        pingType = "blog";
      } else if (body.type === "sitemap" || body.type === "all") {
        urls = [
          `${BASE_URL}/`,
          `${BASE_URL}/products`,
          `${BASE_URL}/bestsellers`,
          `${BASE_URL}/blog`,
        ];
        pingType = body.type;
      }
    } else if (req.method === "GET") {
      pingType = "sitemap-refresh";
    }

    // Execute pings in parallel with Promise.allSettled — never hangs
    const [indexNowSettled, googleSettled] = await Promise.allSettled([
      urls.length > 0 ? pingIndexNow(urls) : Promise.resolve([]),
      urls.length > 0 ? pingGoogleIndexingAPI(urls) : Promise.resolve({
        engine: "Google Indexing API", success: true, status: 200, urlsProcessed: 0,
      } as PingResult),
    ]);

    const indexNowResults = indexNowSettled.status === "fulfilled" ? indexNowSettled.value : [];
    const googleResult = googleSettled.status === "fulfilled" ? googleSettled.value : {
      engine: "Google Indexing API", success: false, error: googleSettled.reason?.message || "promise rejected",
    } as PingResult;

    // Log the ping (non-blocking)
    try {
      await supabase.from("cron_job_logs").insert({
        job_name: "indexnow-ping",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        success: indexNowResults.every(r => r.success) && googleResult.success,
        details: {
          type: pingType,
          urlCount: urls.length,
          urls: urls.slice(0, 10),
          results: { indexNow: indexNowResults, google: googleResult },
        },
      });
    } catch { /* non-blocking */ }

    const response = {
      success: true,
      message: `Pinged ${urls.length} URL(s) to search engines`,
      pingType,
      urlCount: urls.length,
      results: { indexNow: indexNowResults, google: googleResult },
    };

    console.log(`IndexNow ping completed: ${JSON.stringify(response)}`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("IndexNow ping error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

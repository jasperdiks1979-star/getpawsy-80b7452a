import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// IndexNow API endpoints for different search engines
const INDEXNOW_ENDPOINTS = [
  "https://api.indexnow.org/indexnow",           // IndexNow API (Bing, Yandex, Seznam, Naver)
  "https://www.bing.com/indexnow",               // Bing direct
  "https://yandex.com/indexnow",                 // Yandex direct
];

const BASE_URL = "https://getpawsy.pet";

// IndexNow key - this should be a unique key for your domain
const INDEXNOW_KEY = "e8f4a2b1c9d7e6f5a3b2c1d0e9f8a7b6";

// Google Indexing API endpoint
const GOOGLE_INDEXING_API = "https://indexing.googleapis.com/v3/urlNotifications:publish";

interface PingRequest {
  urls?: string[];
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

// Generate JWT for Google Service Account authentication
async function generateGoogleJWT(credentials: ServiceAccountCredentials): Promise<string> {
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

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

  // Import the private key for signing
  const pemContents = credentials.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(unsignedToken)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${unsignedToken}.${signatureB64}`;
}

// Get Google access token using service account
async function getGoogleAccessToken(credentials: ServiceAccountCredentials): Promise<string | null> {
  try {
    const jwt = await generateGoogleJWT(credentials);
    
    const response = await fetch(credentials.token_uri, {
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
    console.error("Error getting Google access token:", error);
    return null;
  }
}

// Ping Google Indexing API for each URL
async function pingGoogleIndexingAPI(urls: string[]): Promise<PingResult> {
  const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  
  if (!serviceAccountJson) {
    return {
      engine: "Google Indexing API",
      success: false,
      error: "GOOGLE_SERVICE_ACCOUNT_JSON not configured",
    };
  }

  try {
    const credentials: ServiceAccountCredentials = JSON.parse(serviceAccountJson);
    const accessToken = await getGoogleAccessToken(credentials);
    
    if (!accessToken) {
      return {
        engine: "Google Indexing API",
        success: false,
        error: "Failed to obtain access token",
      };
    }

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    // Google Indexing API has rate limits, process URLs sequentially
    // Limit to 200 URLs per day per property
    const urlsToProcess = urls.slice(0, 200);
    
    for (const url of urlsToProcess) {
      try {
        const response = await fetch(GOOGLE_INDEXING_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            url: url,
            type: "URL_UPDATED",
          }),
        });

        if (response.ok) {
          successCount++;
        } else {
          failCount++;
          const errorText = await response.text();
          if (errors.length < 3) {
            errors.push(`${url}: ${response.status} - ${errorText.substring(0, 100)}`);
          }
        }
        
        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        failCount++;
        if (errors.length < 3) {
          errors.push(`${url}: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
    }

    return {
      engine: "Google Indexing API",
      success: successCount > 0,
      status: successCount > 0 ? 200 : 500,
      urlsProcessed: successCount,
      error: errors.length > 0 ? errors.join("; ") : undefined,
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
  const results: PingResult[] = [];
  
  // Prepare the request body for batch submission
  const body = {
    host: "getpawsy.pet",
    key: INDEXNOW_KEY,
    keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
    urlList: urls.slice(0, 10000),
  };

  for (const endpoint of INDEXNOW_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      results.push({
        engine: endpoint.includes("bing") ? "Bing" : 
                endpoint.includes("yandex") ? "Yandex" : "IndexNow API",
        success: response.status >= 200 && response.status < 300,
        status: response.status,
      });
    } catch (error) {
      results.push({
        engine: endpoint.includes("bing") ? "Bing" : 
                endpoint.includes("yandex") ? "Yandex" : "IndexNow API",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
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

    // Handle different request types
    if (req.method === "POST") {
      const body: PingRequest = await req.json();
      
      if (body.urls && body.urls.length > 0) {
        // Direct URL submission (array)
        urls = body.urls.map((url: string) => url.startsWith("http") ? url : `${BASE_URL}${url}`);
        pingType = "direct";
      } else if (body.url && typeof body.url === "string") {
        // Single URL submission (backwards compat / fallback)
        urls = [body.url.startsWith("http") ? body.url : `${BASE_URL}${body.url}`];
        pingType = "direct";
      } else if (body.productId) {
        // Single product update
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
        // Blog post update
        urls = [`${BASE_URL}/blog/${body.blogSlug}`];
        pingType = "blog";
      } else if (body.type === "sitemap" || body.type === "all") {
        // Ping all sitemaps
        urls = [
          `${BASE_URL}/`,
          `${BASE_URL}/products`,
          `${BASE_URL}/bestsellers`,
          `${BASE_URL}/blog`,
        ];
        pingType = body.type;
      }
    } else if (req.method === "GET") {
      // Quick ping for sitemap refresh
      pingType = "sitemap-refresh";
    }

    // Execute pings in parallel
    const [indexNowResults, googleResult] = await Promise.all([
      urls.length > 0 ? pingIndexNow(urls) : Promise.resolve([]),
      urls.length > 0 ? pingGoogleIndexingAPI(urls) : Promise.resolve({
        engine: "Google Indexing API",
        success: true,
        status: 200,
        urlsProcessed: 0,
      } as PingResult),
    ]);

    // Log the ping
    await supabase.from("cron_job_logs").insert({
      job_name: "indexnow-ping",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      success: indexNowResults.every(r => r.success) && googleResult.success,
      details: {
        type: pingType,
        urlCount: urls.length,
        urls: urls.slice(0, 10), // Log first 10 URLs
        results: {
          indexNow: indexNowResults,
          google: googleResult,
        },
      },
    });

    const response = {
      success: true,
      message: `Pinged ${urls.length} URL(s) to search engines`,
      pingType,
      urlCount: urls.length,
      results: {
        indexNow: indexNowResults,
        google: googleResult,
      },
      tip: "IndexNow → Bing, Yandex, Seznam, Naver. Google Indexing API → Direct URL submission.",
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
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

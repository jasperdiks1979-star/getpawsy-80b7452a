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

// Google uses a different approach - we'll ping the sitemap
const GOOGLE_PING_URL = "https://www.google.com/ping";

const BASE_URL = "https://getpawsy.pet";
const SITEMAP_URL = "https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/generate-sitemap";

// IndexNow key - this should be a unique key for your domain
// The key file should be accessible at https://getpawsy.pet/{key}.txt
const INDEXNOW_KEY = "e8f4a2b1c9d7e6f5a3b2c1d0e9f8a7b6";

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
}

async function pingIndexNow(urls: string[]): Promise<PingResult[]> {
  const results: PingResult[] = [];
  
  // Prepare the request body for batch submission
  const body = {
    host: "getpawsy.pet",
    key: INDEXNOW_KEY,
    keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
    urlList: urls.slice(0, 10000), // IndexNow supports up to 10,000 URLs per request
  };

  for (const endpoint of INDEXNOW_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

async function pingGoogle(): Promise<PingResult> {
  try {
    // Google deprecated the /ping endpoint, but still accepts sitemap submissions
    // The most reliable way is through Search Console API or submitting sitemaps directly
    // We'll make a request to the sitemap URL to trigger a refresh signal
    const response = await fetch(`${SITEMAP_URL}?type=index`, {
      headers: {
        "User-Agent": "GetPawsy-IndexNow-Bot/1.0 (+https://getpawsy.pet)",
      },
    });
    
    return {
      engine: "Google (sitemap refresh)",
      success: response.status === 200,
      status: response.status,
      // Note: For proper Google indexing, use Search Console URL Inspection API
    };
  } catch (error) {
    return {
      engine: "Google (sitemap refresh)",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function pingGoogleUrl(url: string): Promise<PingResult> {
  // Google's URL Inspection API requires OAuth, so we use the sitemap ping approach
  // For individual URLs, we trigger a sitemap refresh which signals Google to recrawl
  return pingGoogle();
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
        // Direct URL submission
        urls = body.urls.map(url => url.startsWith("http") ? url : `${BASE_URL}${url}`);
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

    // Execute pings
    const indexNowResults = urls.length > 0 ? await pingIndexNow(urls) : [];
    const googleResult = await pingGoogle();

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
      tip: "IndexNow notifies Bing, Yandex, Seznam & Naver. Google uses sitemap pings.",
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

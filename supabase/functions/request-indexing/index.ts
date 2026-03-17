import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BASE_URL = "https://getpawsy.pet";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url, slug } = await req.json();
    const targetUrl = url || (slug ? `${BASE_URL}/guides/${slug}` : null);

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "url or slug required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    const results: any = { url: targetUrl, indexnow: false, google: false };

    // 1. IndexNow (Bing, Yandex, etc.)
    try {
      const indexNowResponse = await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: "getpawsy.pet",
          key: "a1b2c3d4e5f6", // IndexNow key
          urlList: [targetUrl],
        }),
      });
      results.indexnow = indexNowResponse.ok;
    } catch {
      results.indexnow = false;
    }

    // 2. Google Indexing API (if service account configured)
    if (serviceAccountJson) {
      try {
        const sa = JSON.parse(serviceAccountJson);
        
        // Create JWT for Google auth
        const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
        const now = Math.floor(Date.now() / 1000);
        const payload = btoa(JSON.stringify({
          iss: sa.client_email,
          scope: "https://www.googleapis.com/auth/indexing",
          aud: "https://oauth2.googleapis.com/token",
          iat: now,
          exp: now + 3600,
        }));

        // Import the private key
        const pemContent = sa.private_key
          .replace("-----BEGIN PRIVATE KEY-----", "")
          .replace("-----END PRIVATE KEY-----", "")
          .replace(/\n/g, "");
        const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));
        
        const cryptoKey = await crypto.subtle.importKey(
          "pkcs8", binaryKey.buffer,
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
          false, ["sign"]
        );

        const signInput = new TextEncoder().encode(`${header}.${payload}`);
        const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signInput);
        const jwt = `${header}.${payload}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;

        // Get access token
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
        });

        if (tokenRes.ok) {
          const { access_token } = await tokenRes.json();

          // Request indexing
          const indexRes = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: targetUrl, type: "URL_UPDATED" }),
          });

          results.google = indexRes.ok;
          if (!indexRes.ok) {
            results.googleError = await indexRes.text();
          }
        }
      } catch (err) {
        results.google = false;
        results.googleError = err instanceof Error ? err.message : "Auth error";
      }
    }

    // Update published_guides if this is a guide
    if (slug) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabase.from("published_guides").update({
        is_indexed: true,
        indexed_at: new Date().toISOString(),
      }).eq("slug", slug);
    }

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("request-indexing error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

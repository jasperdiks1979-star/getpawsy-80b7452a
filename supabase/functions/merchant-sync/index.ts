import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// AES-GCM decryption
async function decryptToken(encrypted: string, keyStr: string): Promise<string> {
  const [ivB64, ctB64] = encrypted.split(":");
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyStr.slice(0, 32).padEnd(32, "0")),
    "AES-GCM",
    false,
    ["decrypt"]
  );
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, keyMaterial, ct);
  return new TextDecoder().decode(decrypted);
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number } | null> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) {
    console.error("[merchant-sync] Token refresh failed:", await resp.text());
    return null;
  }
  return await resp.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin check
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) {
      return new Response(
        JSON.stringify({ ok: false, error: "Admin required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit: max 1 sync per minute
    const { data: recentSync } = await supabase
      .from("merchant_sync_logs")
      .select("started_at")
      .eq("status", "running")
      .gt("started_at", new Date(Date.now() - 60000).toISOString())
      .maybeSingle();

    if (recentSync) {
      return new Response(
        JSON.stringify({ ok: false, error: "Sync already running. Wait 1 minute." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get token
    const { data: tokenRecord } = await supabase
      .from("merchant_oauth_tokens")
      .select("*")
      .eq("is_connected", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tokenRecord) {
      return new Response(
        JSON.stringify({ ok: false, error: "Not connected. Please connect Google Merchant first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const encryptionKey = Deno.env.get("TOKEN_ENCRYPTION_KEY")!;
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
    const merchantId = tokenRecord.merchant_center_id || Deno.env.get("GOOGLE_MERCHANT_CENTER_ID");

    if (!merchantId) {
      return new Response(
        JSON.stringify({ ok: false, error: "GOOGLE_MERCHANT_CENTER_ID not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create sync log
    const { data: syncLog } = await supabase
      .from("merchant_sync_logs")
      .insert({
        sync_type: "manual",
        status: "running",
        triggered_by: user.id,
      })
      .select("id")
      .single();

    const syncId = syncLog?.id;

    // Decrypt refresh token and get access token
    let refreshToken: string;
    try {
      refreshToken = await decryptToken(tokenRecord.encrypted_refresh_token, encryptionKey);
    } catch (e) {
      console.error("[merchant-sync] Decrypt failed:", e);
      await markDisconnected(supabase, tokenRecord.id, "Failed to decrypt refresh token", syncId);
      return new Response(
        JSON.stringify({ ok: false, error: "Token decryption failed. Please reconnect." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenResult = await refreshAccessToken(refreshToken, clientId, clientSecret);
    if (!tokenResult) {
      await markDisconnected(supabase, tokenRecord.id, "Refresh token expired or revoked", syncId);
      return new Response(
        JSON.stringify({ ok: false, error: "Token refresh failed. Please reconnect Google Merchant." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update token refresh time
    await supabase
      .from("merchant_oauth_tokens")
      .update({
        token_refreshed_at: new Date().toISOString(),
        access_token_expires_at: new Date(Date.now() + tokenResult.expires_in * 1000).toISOString(),
        last_error: null,
        last_error_at: null,
      })
      .eq("id", tokenRecord.id);

    const accessToken = tokenResult.access_token;

    // 1. Fetch account info
    let accountInfo = null;
    try {
      const accResp = await fetch(
        `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/accounts/${merchantId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (accResp.ok) {
        accountInfo = await accResp.json();
      } else {
        console.error("[merchant-sync] Account fetch failed:", accResp.status, await accResp.text());
      }
    } catch (e) {
      console.error("[merchant-sync] Account fetch error:", e);
    }

    // 2. Fetch product statuses (issues summary)
    let totalProducts = 0;
    let productsWithIssues = 0;
    const issuesSummary: Record<string, number> = {};

    try {
      let nextPageToken: string | undefined;
      let pages = 0;
      const maxPages = 10; // Safety limit

      do {
        const statusUrl = new URL(
          `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/productstatuses`
        );
        statusUrl.searchParams.set("maxResults", "250");
        if (nextPageToken) statusUrl.searchParams.set("pageToken", nextPageToken);

        const statusResp = await fetch(statusUrl.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!statusResp.ok) {
          const errText = await statusResp.text();
          console.error("[merchant-sync] Product statuses failed:", statusResp.status, errText);
          break;
        }

        const statusData = await statusResp.json();
        const resources = statusData.resources || [];

        for (const product of resources) {
          totalProducts++;
          const issues = product.itemLevelIssues || [];
          if (issues.length > 0) {
            productsWithIssues++;
            for (const issue of issues) {
              const key = `${issue.severity || "unknown"}:${issue.description || "unknown"}`;
              issuesSummary[key] = (issuesSummary[key] || 0) + 1;
            }
          }
        }

        nextPageToken = statusData.nextPageToken;
        pages++;
      } while (nextPageToken && pages < maxPages);
    } catch (e) {
      console.error("[merchant-sync] Product statuses error:", e);
    }

    // Update sync log
    await supabase
      .from("merchant_sync_logs")
      .update({
        status: "completed",
        total_products: totalProducts,
        products_with_issues: productsWithIssues,
        issues_summary: issuesSummary,
        account_info: accountInfo
          ? {
              name: accountInfo.name,
              id: accountInfo.id,
              websiteUrl: accountInfo.websiteUrl,
              adultContent: accountInfo.adultContent,
            }
          : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", syncId);

    console.log(
      `[merchant-sync] ✅ Sync complete: ${totalProducts} products, ${productsWithIssues} with issues`
    );

    return new Response(
      JSON.stringify({
        ok: true,
        summary: {
          totalProducts,
          productsWithIssues,
          issuesSummary,
          accountInfo: accountInfo
            ? { name: accountInfo.name, id: accountInfo.id, websiteUrl: accountInfo.websiteUrl }
            : null,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[merchant-sync] Unhandled error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal sync error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function markDisconnected(
  supabase: any,
  tokenId: string,
  errorMsg: string,
  syncId: string | undefined
) {
  await supabase
    .from("merchant_oauth_tokens")
    .update({
      is_connected: false,
      last_error: errorMsg,
      last_error_at: new Date().toISOString(),
    })
    .eq("id", tokenId);

  if (syncId) {
    await supabase
      .from("merchant_sync_logs")
      .update({
        status: "failed",
        error_message: errorMsg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", syncId);
  }
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── AES-GCM decryption ──────────────────────────────────────────
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

// ── Weight normalization (matching cj-google-sync) ──────────────
const LARGE_ITEM_PATTERNS = /xl|large|60"|69"|77"|84"|90"|cat tree|dog bed|stroller|cage|aviary/i;

function normalizeWeight(rawGrams: number | null | undefined, title: string): number {
  let grams = rawGrams ?? 0;
  if (!grams || isNaN(grams)) grams = 0;
  let kg: number;
  if (grams === 0) kg = 0.2;
  else if (grams >= 100 && grams <= 200000) kg = grams / 1000;
  else if (grams > 0 && grams < 100) kg = grams;
  else kg = 0.2;
  if (kg < 0.05) kg = 0.2;
  if (kg > 30) kg = 25;
  if (LARGE_ITEM_PATTERNS.test(title) && kg < 5) kg = 5;
  return Math.round(kg * 100) / 100;
}

function validateImageUrl(url: string | null): { valid: boolean; url: string; reason?: string } {
  const PLACEHOLDER = "https://getpawsy.pet/images/merchant-placeholder.jpg";
  if (!url || url.trim() === "") return { valid: false, url: PLACEHOLDER, reason: "empty_url" };
  if (!url.startsWith("https://") && !url.startsWith("http://"))
    return { valid: false, url: PLACEHOLDER, reason: "not_absolute" };
  let cleaned = url.startsWith("http://") ? url.replace("http://", "https://") : url;
  if (cleaned.includes(" ") || cleaned.length < 15)
    return { valid: false, url: PLACEHOLDER, reason: "malformed_url" };
  return { valid: true, url: cleaned };
}

// ── Google Content API upsert ───────────────────────────────────
async function upsertGoogleProduct(
  accessToken: string,
  merchantId: string,
  product: Record<string, unknown>
): Promise<{ ok: boolean; status?: number; error?: string; offerId?: string }> {
  const url = `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/products`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(product),
    });
    if (res.ok) return { ok: true };
    const body = await res.text();
    return { ok: false, status: res.status, error: body.substring(0, 500), offerId: product.offerId as string };
  } catch (e) {
    return { ok: false, error: (e as Error).message, offerId: product.offerId as string };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const runId = crypto.randomUUID();

  try {
    // ── Auth check ────────────────────────────────────────────────
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

    // ── Parse body ────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const modeReceived = body.mode || "live";
    const modeEffective = modeReceived === "dryrun" ? "dryrun" : "live";
    const limit = body.limit || 75;

    console.log(`[merchant-sync] START runId=${runId} invokedBy=admin_button mode_received=${modeReceived} mode_effective=${modeEffective} limit=${limit}`);

    // ── Rate limit ────────────────────────────────────────────────
    const { data: recentSync } = await supabase
      .from("merchant_sync_logs")
      .select("started_at")
      .eq("status", "running")
      .neq("sync_type", "debug_dry_run")
      .gt("started_at", new Date(Date.now() - 60000).toISOString())
      .maybeSingle();

    if (recentSync) {
      return new Response(
        JSON.stringify({ ok: false, error: "Sync already running. Wait 1 minute." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Get OAuth token ───────────────────────────────────────────
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
    const merchantIdLast4 = merchantId ? merchantId.slice(-4) : "none";

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
        sync_type: modeEffective === "dryrun" ? "admin_dryrun" : "manual",
        status: "running",
        triggered_by: user.id,
      })
      .select("id")
      .single();
    const syncId = syncLog?.id;

    // Decrypt + refresh token
    let refreshToken: string;
    try {
      refreshToken = await decryptToken(tokenRecord.encrypted_refresh_token, encryptionKey);
    } catch (e) {
      console.error("[merchant-sync] Decrypt failed:", e);
      await markFailed(supabase, syncId, "Failed to decrypt refresh token");
      return new Response(
        JSON.stringify({ ok: false, error: "Token decryption failed. Please reconnect." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenResult = await refreshAccessToken(refreshToken, clientId, clientSecret);
    if (!tokenResult) {
      await supabase
        .from("merchant_oauth_tokens")
        .update({ is_connected: false, last_error: "Refresh token expired or revoked", last_error_at: new Date().toISOString() })
        .eq("id", tokenRecord.id);
      await markFailed(supabase, syncId, "Token refresh failed");
      return new Response(
        JSON.stringify({ ok: false, error: "Token refresh failed. Please reconnect Google Merchant." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // ── STEP 1: Source query (EXACT same as cj-google-sync) ─────
    const sourceQuery = "SELECT id,name,slug,description,price,image_url,stock,weight,cj_product_id,is_active,images FROM products WHERE is_active=true AND price>0 ORDER BY id";

    const { data: products, error: dbErr, count: rawCount } = await supabase
      .from("products")
      .select("id, name, slug, description, price, image_url, stock, weight, cj_product_id, is_active, images", { count: "exact" })
      .eq("is_active", true)
      .gt("price", 0)
      .order("id")
      .range(0, limit - 1);

    if (dbErr) {
      await markFailed(supabase, syncId, `DB error: ${dbErr.message}`);
      return new Response(
        JSON.stringify({ ok: false, error: `DB query failed: ${dbErr.message}`, runId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const totalRaw = rawCount ?? 0;
    console.log(`[merchant-sync] rawCount=${totalRaw}, batch=${products?.length ?? 0}, limit=${limit}, merchantId_last4=${merchantIdLast4}`);

    // ── STEP 2: Eligibility + payload build ─────────────────────
    let eligibleCount = 0;
    let payloadBuiltCount = 0;
    let attemptedSendCount = 0;
    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ offerId: string; status?: number; reason: string }> = [];
    const skippedReasons: Record<string, number> = {};

    const payloads: Array<Record<string, unknown>> = [];

    for (const p of (products || [])) {
      // Skip checks (matching cj-google-sync)
      if (!p.price || p.price <= 0) {
        skippedReasons["missing_price"] = (skippedReasons["missing_price"] || 0) + 1;
        continue;
      }

      const weightKg = normalizeWeight(p.weight, p.name || "");
      if (weightKg > 30) {
        skippedReasons["weight_over_30kg"] = (skippedReasons["weight_over_30kg"] || 0) + 1;
        continue;
      }

      const imageResult = validateImageUrl(p.image_url);
      if (!imageResult.valid && !imageResult.url) {
        skippedReasons["no_image"] = (skippedReasons["no_image"] || 0) + 1;
        continue;
      }

      eligibleCount++;

      // Additional images
      const additionalImages: string[] = [];
      if (p.images && Array.isArray(p.images)) {
        for (const img of (p.images as string[]).slice(0, 9)) {
          const r = validateImageUrl(img);
          if (r.valid) additionalImages.push(r.url);
        }
      }

      const googleProduct: Record<string, unknown> = {
        offerId: p.id,
        title: (p.name || "").substring(0, 150),
        description: (p.description || p.name || "").substring(0, 5000),
        link: `https://getpawsy.pet/product/${p.slug}`,
        imageLink: imageResult.url,
        contentLanguage: "en",
        targetCountry: "US",
        channel: "online",
        availability: p.stock && p.stock > 0 ? "in stock" : "out of stock",
        condition: "new",
        price: { value: p.price.toFixed(2), currency: "USD" },
        brand: "GetPawsy",
        shippingWeight: { value: weightKg.toString(), unit: "kg" },
      };
      if (additionalImages.length > 0) {
        googleProduct.additionalImageLinks = additionalImages;
      }

      payloads.push(googleProduct);
      payloadBuiltCount++;
    }

    console.log(`[merchant-sync] eligibleCount=${eligibleCount} payloadBuiltCount=${payloadBuiltCount} modeEffective=${modeEffective}`);

    // ── STEP 3: Send to Google (LIVE only) ──────────────────────
    if (modeEffective === "live") {
      if (payloadBuiltCount > 0) {
        attemptedSendCount = payloadBuiltCount;

        for (const payload of payloads) {
          const result = await upsertGoogleProduct(accessToken, merchantId, payload);
          if (result.ok) {
            successCount++;
          } else {
            errorCount++;
            errors.push({
              offerId: (payload.offerId as string) || "unknown",
              status: result.status,
              reason: (result.error || "unknown").substring(0, 300),
            });
          }
        }
      } else if (eligibleCount > 0) {
        // Should not happen, but guard
        const errMsg = `BUG: eligibleCount=${eligibleCount} but payloadBuiltCount=0 — payload build produced nothing`;
        console.error(`[merchant-sync] ${errMsg}`);
        await markFailed(supabase, syncId, errMsg);
        return new Response(
          JSON.stringify({ ok: false, error: errMsg, runId, mode_effective: modeEffective }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── STEP 4: Also read product statuses from Google ──────────
    let googleTotalProducts = 0;
    let googleProductsWithIssues = 0;
    const issuesSummary: Record<string, number> = {};

    if (modeEffective === "live") {
      try {
        let nextPageToken: string | undefined;
        let pages = 0;
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
            console.error("[merchant-sync] Product statuses failed:", statusResp.status);
            await statusResp.text(); // consume body
            break;
          }

          const statusData = await statusResp.json();
          const resources = statusData.resources || [];
          for (const product of resources) {
            googleTotalProducts++;
            const issues = product.itemLevelIssues || [];
            if (issues.length > 0) {
              googleProductsWithIssues++;
              for (const issue of issues) {
                const key = `${issue.severity || "unknown"}:${issue.description || "unknown"}`;
                issuesSummary[key] = (issuesSummary[key] || 0) + 1;
              }
            }
          }
          nextPageToken = statusData.nextPageToken;
          pages++;
        } while (nextPageToken && pages < 10);
      } catch (e) {
        console.error("[merchant-sync] Product statuses error:", e);
      }
    }

    // ── Persist to merchant_sync_logs ────────────────────────────
    const debugSummary = {
      runId,
      mode_effective: modeEffective,
      merchantId_last4: merchantIdLast4,
      sourceQuery,
      rawCount: totalRaw,
      batchSize: products?.length ?? 0,
      eligibleCount,
      payloadBuiltCount,
      attemptedSendCount,
      successCount,
      errorCount,
      skippedReasons,
      topErrors: errors.slice(0, 10),
      googleTotalProducts,
      googleProductsWithIssues,
    };

    if (syncId) {
      await supabase
        .from("merchant_sync_logs")
        .update({
          status: "completed",
          total_products: modeEffective === "live" ? googleTotalProducts : 0,
          products_with_issues: googleProductsWithIssues,
          issues_summary: { ...issuesSummary, _sync_funnel: debugSummary },
          completed_at: new Date().toISOString(),
          raw_count: totalRaw,
          eligible_count: eligibleCount,
          payload_built_count: payloadBuiltCount,
          sent_count: modeEffective === "live" ? successCount : 0,
          debug_report: debugSummary,
        })
        .eq("id", syncId);
    }

    console.log(`[merchant-sync] DONE runId=${runId} mode=${modeEffective} raw=${totalRaw} eligible=${eligibleCount} payload=${payloadBuiltCount} attempted=${attemptedSendCount} success=${successCount} errors=${errorCount}`);

    return new Response(
      JSON.stringify({
        ok: true,
        runId,
        mode_effective: modeEffective,
        rawCount: totalRaw,
        eligibleCount,
        payloadBuiltCount,
        attemptedSendCount,
        successCount,
        errorCount,
        skippedReasons,
        topErrors: errors.slice(0, 10),
        sourceQuery,
        googleStatusSummary: modeEffective === "live" ? {
          totalProducts: googleTotalProducts,
          productsWithIssues: googleProductsWithIssues,
          issuesSummary,
        } : null,
        summary: {
          totalProducts: modeEffective === "live" ? googleTotalProducts : 0,
          productsWithIssues: googleProductsWithIssues,
          issuesSummary,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[merchant-sync] Unhandled error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message, runId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function markFailed(supabase: any, syncId: string | undefined, errorMsg: string) {
  if (!syncId) return;
  await supabase
    .from("merchant_sync_logs")
    .update({
      status: "failed",
      error_message: errorMsg,
      completed_at: new Date().toISOString(),
    })
    .eq("id", syncId);
}

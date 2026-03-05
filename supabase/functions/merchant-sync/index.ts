import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sanitizeProduct, type ComplianceSummary, mapGoogleCategory, rewriteCloudinaryUrl, generateSafeDescription } from "./compliance-sanitizer.ts";

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

// ── Stable offer ID ─────────────────────────────────────────────
function buildStableOfferId(product: { id: string; slug?: string | null }): string {
  if (product.id) return `getpawsy_${product.id}`;
  if (product.slug) return `getpawsy_${product.slug}`;
  return `getpawsy_unknown_${Date.now()}`;
}

// ── Weight normalization (matching cj-google-sync) ──────────────
const LARGE_ITEM_PATTERNS = /xl|large|60"|69"|77"|84"|90"|cat tree|dog bed|stroller|cage|aviary/i;

function normalizeWeight(rawGrams: number | null | undefined, title: string): { kg: number; suspicious: boolean; converted: boolean } {
  let grams = rawGrams ?? 0;
  if (!grams || isNaN(grams)) grams = 0;
  let kg: number;
  let converted = false;

  // Detect if value is likely grams (>= 100) and convert
  if (grams === 0) { kg = 0.2; }
  else if (grams >= 100 && grams <= 200000) { kg = grams / 1000; converted = true; }
  else if (grams > 0 && grams < 100) { kg = grams; }
  else { kg = 0.2; }

  if (kg < 0.05) kg = 0.2;
  if (LARGE_ITEM_PATTERNS.test(title) && kg < 5) kg = 5;

  // Flag suspicious weights (>50kg = likely invalid for pet accessories)
  const suspicious = kg > 50;
  if (kg > 25) kg = 25; // cap at 25kg for export

  return { kg: Math.round(kg * 100) / 100, suspicious, converted };
}

function validateImageUrlSync(url: string | null): { valid: boolean; url: string; reason?: string } {
  const PLACEHOLDER = "https://getpawsy.pet/images/merchant-placeholder.jpg";
  if (!url || url.trim() === "") return { valid: false, url: PLACEHOLDER, reason: "empty_url" };
  if (!url.startsWith("https://") && !url.startsWith("http://"))
    return { valid: false, url: PLACEHOLDER, reason: "not_absolute" };
  let cleaned = url.startsWith("http://") ? url.replace("http://", "https://") : url;
  if (cleaned.includes(" ") || cleaned.length < 15)
    return { valid: false, url: PLACEHOLDER, reason: "malformed_url" };
  try { new URL(cleaned); } catch { return { valid: false, url: PLACEHOLDER, reason: "unparseable_url" }; }
  return { valid: true, url: cleaned };
}

/** Live image validation: HEAD request to check accessibility + content-type */
async function validateImageLive(url: string): Promise<{ valid: boolean; finalUrl: string; reason?: string; rewritten: boolean }> {
  const syncCheck = validateImageUrlSync(url);
  if (!syncCheck.valid) return { valid: false, finalUrl: syncCheck.url, reason: syncCheck.reason, rewritten: false };

  try {
    const res = await fetch(syncCheck.url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
    });
    if (!res.ok) return { valid: false, finalUrl: syncCheck.url, reason: `http_${res.status}`, rewritten: false };
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return { valid: false, finalUrl: syncCheck.url, reason: `bad_content_type:${ct.substring(0, 50)}`, rewritten: false };
    const finalUrl = res.url || syncCheck.url;
    const rewritten = finalUrl !== syncCheck.url;
    return { valid: true, finalUrl, rewritten };
  } catch (e) {
    return { valid: false, finalUrl: syncCheck.url, reason: `fetch_error:${(e as Error).message?.substring(0, 60)}`, rewritten: false };
  }
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

// ── Google Content API delete ───────────────────────────────────
async function deleteGoogleProduct(
  accessToken: string,
  merchantId: string,
  productId: string
): Promise<{ ok: boolean; status?: number; error?: string }> {
  // productId is the full resource ID from listing, e.g. "online:en:US:getpawsy_xxx"
  const url = `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/products/${encodeURIComponent(productId)}`;
  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok || res.status === 404) return { ok: true };
    const body = await res.text();
    return { ok: false, status: res.status, error: body.substring(0, 300) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ── List all Merchant products ──────────────────────────────────
async function listMerchantProducts(
  accessToken: string,
  merchantId: string
): Promise<Array<{ id: string; offerId: string }>> {
  const all: Array<{ id: string; offerId: string }> = [];
  let nextPageToken: string | undefined;
  let pages = 0;
  do {
    const url = new URL(`https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/products`);
    url.searchParams.set("maxResults", "250");
    if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);
    
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error("[merchant-sync] List products failed:", res.status);
      break;
    }
    const data = await res.json();
    for (const r of (data.resources || [])) {
      all.push({ id: r.id, offerId: r.offerId || "" });
    }
    nextPageToken = data.nextPageToken;
    pages++;
  } while (nextPageToken && pages < 20);
  return all;
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
    // Prune config (from body or env)
    const PRUNE_ENABLED = body.prune_enabled === true || Deno.env.get("PRUNE_ENABLED") === "true";
    const PRUNE_DRYRUN = body.prune_dryrun !== false && Deno.env.get("PRUNE_DRYRUN") !== "false"; // default true
    const PRUNE_PREFIXES = (body.prune_prefixes || Deno.env.get("PRUNE_PREFIXES") || "getpawsy_").split(",").map((s: string) => s.trim()).filter(Boolean);
    // Image config
    const SEND_ADDITIONAL_IMAGES = body.send_additional_images !== false && Deno.env.get("SEND_ADDITIONAL_IMAGES") !== "false"; // default true

    console.log(`[merchant-sync] START runId=${runId} mode_received=${modeReceived} mode_effective=${modeEffective} limit=${limit} prune=${PRUNE_ENABLED} prune_dryrun=${PRUNE_DRYRUN}`);

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
    const merchantId = tokenRecord.merchant_center_id || Deno.env.get("GOOGLE_MERCHANT_ID");
    const merchantIdLast4 = merchantId ? merchantId.slice(-4) : "none";
    const merchantIdSource = tokenRecord.merchant_center_id ? "oauth_token_record" : "GOOGLE_MERCHANT_ID";

    if (!merchantId) {
      return new Response(
        JSON.stringify({ ok: false, error: "GOOGLE_MERCHANT_ID not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Google Auth Debug ───────────────────────────────────────────
    const googleAuthDebug: Record<string, unknown> = {
      authMethod: "oauth_token",
      project_id: null,
      client_email: null,
      client_id: null,
      merchantId,
      token_project_number_if_available: null,
    };

    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (saJson) {
      try {
        const sa = JSON.parse(saJson);
        googleAuthDebug.project_id = sa.project_id || null;
        googleAuthDebug.client_email = sa.client_email || null;
        googleAuthDebug.client_id = sa.client_id || null;
        console.log(`[merchant-sync] SA GCP project_id=${sa.project_id} client_email=${sa.client_email}`);
      } catch (_) { /* ignore parse errors */ }
    }

    const oauthMatch = clientId.match(/^(\d+)-/);
    if (oauthMatch) {
      googleAuthDebug.token_project_number_if_available = oauthMatch[1];
    }
    googleAuthDebug.oauth_client_id = clientId;

    console.log(`[merchant-sync] googleAuthDebug:`, JSON.stringify(googleAuthDebug));

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

    // ── PRE-EXPORT: Auto-deactivate zero-stock products ─────────
    const { count: deactivatedCount } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("is_active", true)
      .or("stock.is.null,stock.lte.0")
      .select("id", { count: "exact", head: true });
    if (deactivatedCount && deactivatedCount > 0) {
      console.log(`[merchant-sync] Auto-deactivated ${deactivatedCount} zero-stock products before export`);
    }

    // ── STEP 1: Source query ────────────────────────────────────
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

    // ── STEP 2: Eligibility + payload build + COMPLIANCE SANITIZATION ─
    const COMPLIANCE_SAFE = true;
    const MAX_BATCH_SIZE = body.max_batch_size || 100; // STEP 7: Export limit safety
    let eligibleCount = 0;
    let payloadBuiltCount = 0;
    let attemptedSendCount = 0;
    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ offerId: string; status?: number; reason: string }> = [];
    const skippedReasons: Record<string, number> = {};

    // Compliance counters
    let sanitizedTitlesCount = 0;
    let sanitizedDescriptionsCount = 0;
    let removedPhrasesCount = 0;
    let blockedForCompliance = 0;
    const blockedReasons: Record<string, number> = {};
    let descriptionsFallbackCount = 0;
    let googleCategorySetCount = 0;
    let googleCategoryOmittedCount = 0;
    let googleCategoryInvalidPrevented = 0;
    let imageLinkValidCount = 0;
    let imageLinkRewrittenCount = 0;
    let cloudinaryRewriteCount = 0;
    let additionalImagesRemovedCount = 0;
    let weightNormalizedCount = 0;
    let weightSuspiciousCount = 0;
    const imageFailuresSample: Array<{ url: string; reason: string }> = [];
    const exclusionReport: Record<string, number> = {};

    const payloads: Array<Record<string, unknown>> = [];
    const exportedOfferIds: Set<string> = new Set();

    for (const p of (products || [])) {
      // STEP 1: Eligibility checks
      if (!p.price || p.price <= 0) {
        skippedReasons["missing_price"] = (skippedReasons["missing_price"] || 0) + 1;
        exclusionReport["missing_price"] = (exclusionReport["missing_price"] || 0) + 1;
        continue;
      }
      if (!p.slug) {
        skippedReasons["missing_slug"] = (skippedReasons["missing_slug"] || 0) + 1;
        exclusionReport["missing_slug"] = (exclusionReport["missing_slug"] || 0) + 1;
        continue;
      }

      // STEP 4: Weight normalization with gram detection
      const weightResult = normalizeWeight(p.weight, p.name || "");
      if (weightResult.suspicious) {
        weightSuspiciousCount++;
        skippedReasons["weight_over_50kg"] = (skippedReasons["weight_over_50kg"] || 0) + 1;
        exclusionReport["suspicious_weight"] = (exclusionReport["suspicious_weight"] || 0) + 1;
        continue;
      }
      if (weightResult.converted) weightNormalizedCount++;
      const weightKg = weightResult.kg;

      // STEP 2: Image resolution fix with Cloudinary rewrite
      let imageUrl = p.image_url;
      if (!imageUrl) {
        skippedReasons["missing_image"] = (skippedReasons["missing_image"] || 0) + 1;
        exclusionReport["invalid_image"] = (exclusionReport["invalid_image"] || 0) + 1;
        continue;
      }
      const cloudinaryResult = rewriteCloudinaryUrl(imageUrl);
      if (cloudinaryResult.rewritten) {
        imageUrl = cloudinaryResult.url;
        cloudinaryRewriteCount++;
      }

      const imageResult = await validateImageLive(imageUrl);
      const PLACEHOLDER = "https://getpawsy.pet/images/merchant-placeholder.jpg";
      let finalImageLink = imageResult.valid ? imageResult.finalUrl : PLACEHOLDER;

      if (imageResult.valid) {
        imageLinkValidCount++;
        if (imageResult.rewritten) imageLinkRewrittenCount++;
      } else {
        // STEP 1: If product has no valid image, exclude from export
        if (imageFailuresSample.length < 10) {
          imageFailuresSample.push({ url: imageUrl || "(null)", reason: imageResult.reason || "unknown" });
        }
        skippedReasons["invalid_image"] = (skippedReasons["invalid_image"] || 0) + 1;
        exclusionReport["invalid_image"] = (exclusionReport["invalid_image"] || 0) + 1;
        continue;
      }

      eligibleCount++;

      // STEP 1: Auto-generate safe description if missing
      let rawDesc = (p.description || "").substring(0, 5000);
      if (!rawDesc || rawDesc.trim().length < 10) {
        rawDesc = generateSafeDescription(p.name || "Pet Accessory");
        descriptionsFallbackCount++;
      }

      // STEP 3: Title sanitization (incl. dropship cleanup)
      const rawTitle = (p.name || "").substring(0, 150);

      const compliance = sanitizeProduct({
        title: rawTitle,
        description: rawDesc,
        category: null,
        weightKg,
      });

      if (compliance.titleChanged) sanitizedTitlesCount++;
      if (compliance.descriptionChanged) sanitizedDescriptionsCount++;
      removedPhrasesCount += compliance.removedPhrases.length;
      if (compliance.descriptionFallbackGenerated) descriptionsFallbackCount++;

      if (COMPLIANCE_SAFE && compliance.blocked) {
        blockedForCompliance++;
        const reason = compliance.blockReason || "unknown";
        blockedReasons[reason] = (blockedReasons[reason] || 0) + 1;
        skippedReasons[`compliance:${reason}`] = (skippedReasons[`compliance:${reason}`] || 0) + 1;
        exclusionReport["compliance_blocked"] = (exclusionReport["compliance_blocked"] || 0) + 1;
        continue;
      }

      // STEP 5: Google product category mapping
      const categoryId = compliance.googleProductCategory;
      if (categoryId !== null && typeof categoryId === "number") {
        googleCategorySetCount++;
      } else {
        googleCategoryOmittedCount++;
      }

      // Additional images (live validated)
      const additionalImages: string[] = [];
      if (SEND_ADDITIONAL_IMAGES && p.images && Array.isArray(p.images)) {
        for (const img of (p.images as string[]).slice(0, 10)) {
          // Also rewrite Cloudinary URLs for additional images
          const cldResult = rewriteCloudinaryUrl(img);
          const imgToValidate = cldResult.rewritten ? cldResult.url : img;
          if (cldResult.rewritten) cloudinaryRewriteCount++;
          const r = await validateImageLive(imgToValidate);
          if (r.valid) {
            additionalImages.push(r.finalUrl);
          } else {
            additionalImagesRemovedCount++;
            if (imageFailuresSample.length < 10) {
              imageFailuresSample.push({ url: img || "(null)", reason: `additional:${r.reason || "unknown"}` });
            }
          }
        }
      }

      // Stable offer ID
      const offerId = buildStableOfferId(p);
      exportedOfferIds.add(offerId);

      // STEP 1: Stock-based availability
      const availability = (Number.isFinite(p.stock) && Math.floor(p.stock as number) > 0) ? "in stock" : "out of stock";

      const googleProduct: Record<string, unknown> = {
        offerId,
        title: compliance.sanitizedTitle,
        description: compliance.sanitizedDescription,
        link: `https://getpawsy.pet/product/${p.slug}`,
        imageLink: finalImageLink,
        contentLanguage: "en",
        targetCountry: "US",
        channel: "online",
        availability,
        condition: "new",
        price: { value: p.price.toFixed(2), currency: "USD" },
        brand: "GetPawsy",
        shippingWeight: { value: weightKg.toString(), unit: "kg" },
      };

      // Only set numeric category ID
      if (categoryId !== null && typeof categoryId === "number") {
        googleProduct.googleProductCategory = categoryId;
      }

      if (additionalImages.length > 0) {
        googleProduct.additionalImageLinks = additionalImages;
      }

      payloads.push(googleProduct);
      payloadBuiltCount++;

      // STEP 7: Enforce max batch size
      if (payloadBuiltCount >= MAX_BATCH_SIZE) {
        console.log(`[merchant-sync] Batch limit reached (${MAX_BATCH_SIZE}), stopping payload build`);
        break;
      }
    }

    // STEP 9: Failsafe — abort if >10% validation failure rate
    const totalScanned = products?.length ?? 0;
    const totalExcluded = totalScanned - payloadBuiltCount;
    const failureRate = totalScanned > 0 ? totalExcluded / totalScanned : 0;

    if (failureRate > 0.10 && totalScanned >= 10) {
      const failsafeMsg = `Merchant feed halted due to high validation failure rate (${(failureRate * 100).toFixed(1)}% excluded). ${totalExcluded}/${totalScanned} products failed validation.`;
      console.error(`[merchant-sync] FAILSAFE: ${failsafeMsg}`);
      if (syncId) await markFailed(supabase, syncId, failsafeMsg);
      return new Response(
        JSON.stringify({
          ok: false,
          error: failsafeMsg,
          runId,
          failsafe: true,
          exportReport: {
            scanned: totalScanned,
            exported: 0,
            excluded: exclusionReport,
            failureRate: `${(failureRate * 100).toFixed(1)}%`,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[merchant-sync] eligibleCount=${eligibleCount} payloadBuiltCount=${payloadBuiltCount} modeEffective=${modeEffective} exportedOfferIds=${exportedOfferIds.size}`);

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
        const errMsg = `BUG: eligibleCount=${eligibleCount} but payloadBuiltCount=0 — payload build produced nothing`;
        console.error(`[merchant-sync] ${errMsg}`);
        await markFailed(supabase, syncId, errMsg);
        return new Response(
          JSON.stringify({ ok: false, error: errMsg, runId, mode_effective: modeEffective }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── STEP 3.5: PRUNE stale Merchant offers ───────────────────
    const pruneSummary: Record<string, unknown> = {
      enabled: PRUNE_ENABLED,
      dryrun: PRUNE_DRYRUN,
      prefixes: PRUNE_PREFIXES,
      existingCount: 0,
      exportedCount: exportedOfferIds.size,
      wouldDeleteCount: 0,
      deletedCount: 0,
      deleteErrors: 0,
      sampleOfferIds: [] as string[],
    };

    if (PRUNE_ENABLED && modeEffective === "live" && successCount > 0) {
      console.log(`[merchant-sync] PRUNE: listing existing Merchant products...`);
      try {
        const existingProducts = await listMerchantProducts(accessToken, merchantId);
        pruneSummary.existingCount = existingProducts.length;

        // Find stale offers: in Merchant but not in current export, matching our prefixes
        const staleProducts = existingProducts.filter(ep => {
          const matchesPrefix = PRUNE_PREFIXES.some((prefix: string) => ep.offerId.startsWith(prefix));
          if (!matchesPrefix) return false;
          return !exportedOfferIds.has(ep.offerId);
        });

        pruneSummary.wouldDeleteCount = staleProducts.length;
        pruneSummary.sampleOfferIds = staleProducts.slice(0, 20).map(p => p.offerId);

        console.log(`[merchant-sync] PRUNE: existing=${existingProducts.length} stale=${staleProducts.length} dryrun=${PRUNE_DRYRUN}`);

        if (!PRUNE_DRYRUN) {
          let deleted = 0;
          let delErrors = 0;
          for (const sp of staleProducts) {
            const delResult = await deleteGoogleProduct(accessToken, merchantId, sp.id);
            if (delResult.ok) {
              deleted++;
            } else {
              delErrors++;
              console.error(`[merchant-sync] PRUNE delete failed: offerId=${sp.offerId} error=${delResult.error}`);
            }
            // Rate limit: small pause every 10 deletes
            if ((deleted + delErrors) % 10 === 0) {
              await new Promise(r => setTimeout(r, 200));
            }
          }
          pruneSummary.deletedCount = deleted;
          pruneSummary.deleteErrors = delErrors;
          console.log(`[merchant-sync] PRUNE: deleted=${deleted} errors=${delErrors}`);
        }
      } catch (e) {
        console.error("[merchant-sync] PRUNE error:", e);
        pruneSummary.error = (e as Error).message;
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
            await statusResp.text();
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

    // ── Compliance summary ─────────────────────────────────────
    const complianceSummary: ComplianceSummary = {
      total_products_processed: eligibleCount,
      sanitized_titles_count: sanitizedTitlesCount,
      sanitized_descriptions_count: sanitizedDescriptionsCount,
      removed_promotional_phrases_count: removedPhrasesCount,
      products_blocked_for_compliance: blockedForCompliance,
      blocked_reasons: blockedReasons,
      final_export_count: payloadBuiltCount,
      descriptions_fallback_generated_count: descriptionsFallbackCount,
      products_still_blocked_count: blockedForCompliance,
      google_category_set_count: googleCategorySetCount,
      google_category_omitted_count: googleCategoryOmittedCount,
      google_category_invalid_prevented_count: googleCategoryInvalidPrevented,
    };

    console.log(`[merchant-sync] COMPLIANCE: titles=${sanitizedTitlesCount} descs=${sanitizedDescriptionsCount} phrases=${removedPhrasesCount} blocked=${blockedForCompliance}`);

    // ── STEP 8: Structured export report ──────────────────────────
    const exportReport = {
      scanned: totalScanned,
      exported: modeEffective === "live" ? successCount : payloadBuiltCount,
      excluded: exclusionReport,
      failureRate: `${(failureRate * 100).toFixed(1)}%`,
      cloudinary_rewrites: cloudinaryRewriteCount,
      weight_normalized: weightNormalizedCount,
      weight_suspicious_excluded: weightSuspiciousCount,
      descriptions_auto_generated: descriptionsFallbackCount,
      batch_limit_applied: MAX_BATCH_SIZE,
    };

    // ── Persist to merchant_sync_logs ────────────────────────────
    const debugSummary = {
      runId,
      mode_effective: modeEffective,
      merchantId_used: merchantIdLast4,
      merchantId_source: merchantIdSource,
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
      complianceSummary,
      pruneSummary,
      exportReport,
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
        compliance_safe: COMPLIANCE_SAFE,
        merchantId_used: merchantIdLast4,
        merchantId_source: merchantIdSource,
        rawCount: totalRaw,
        eligibleCount,
        payloadBuiltCount,
        attemptedSendCount,
        successCount,
        errorCount,
        skippedReasons,
        topErrors: errors.slice(0, 10),
        complianceSummary,
        exportReport,
        imageDiagnostics: {
          image_link_valid_count: imageLinkValidCount,
          image_link_rewritten_count: imageLinkRewrittenCount,
          cloudinary_rewrite_count: cloudinaryRewriteCount,
          additional_images_removed_count: additionalImagesRemovedCount,
          image_failures_sample: imageFailuresSample,
          send_additional_images: SEND_ADDITIONAL_IMAGES,
        },
        pruneSummary,
        googleAuthDebug,
        sourceQuery,
        googleStatusSummary: modeEffective === "live" ? {
          totalProducts: googleTotalProducts,
          productsWithIssues: googleProductsWithIssues,
          issuesSummary,
        } : null,
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

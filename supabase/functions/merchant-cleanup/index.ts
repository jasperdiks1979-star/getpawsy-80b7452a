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
  refreshToken: string, clientId: string, clientSecret: string
): Promise<{ access_token: string; expires_in: number } | null> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken, client_id: clientId,
      client_secret: clientSecret, grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) { console.error("[merchant-cleanup] Token refresh failed:", await resp.text()); return null; }
  return await resp.json();
}

// ── List all Merchant products ──────────────────────────────────
async function listMerchantProducts(accessToken: string, merchantId: string): Promise<Array<{ id: string; offerId: string; title?: string; imageLink?: string; additionalImageLinks?: string[]; googleProductCategory?: string }>> {
  const all: Array<any> = [];
  let nextPageToken: string | undefined;
  let pages = 0;
  do {
    const url = new URL(`https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/products`);
    url.searchParams.set("maxResults", "250");
    if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) { console.error("[merchant-cleanup] List products failed:", res.status); break; }
    const data = await res.json();
    for (const r of (data.resources || [])) {
      all.push({
        id: r.id, offerId: r.offerId || "", title: r.title,
        imageLink: r.imageLink, additionalImageLinks: r.additionalImageLinks,
        googleProductCategory: r.googleProductCategory,
      });
    }
    nextPageToken = data.nextPageToken;
    pages++;
  } while (nextPageToken && pages < 20);
  return all;
}

// ── List product statuses ───────────────────────────────────────
async function listProductStatuses(accessToken: string, merchantId: string): Promise<{ products: Array<any>; accountIssues: string[] }> {
  const products: Array<any> = [];
  const accountIssues: string[] = [];
  let nextPageToken: string | undefined;
  let pages = 0;
  do {
    const url = new URL(`https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/productstatuses`);
    url.searchParams.set("maxResults", "250");
    if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) { console.error("[merchant-cleanup] Statuses failed:", res.status); break; }
    const data = await res.json();
    for (const p of (data.resources || [])) {
      const issues = p.itemLevelIssues || [];
      products.push({
        offerId: p.productId || "", title: p.title,
        issues: issues.map((i: any) => ({
          severity: i.severity, description: i.description, detail: i.detail,
          servability: i.servability, applicableCountries: i.applicableCountries,
        })),
      });
      // Detect account-level issues
      for (const issue of issues) {
        const desc = (issue.description || "").toLowerCase();
        if (desc.includes("suspended") || desc.includes("account") || desc.includes("policy violation")) {
          const key = issue.description;
          if (!accountIssues.includes(key)) accountIssues.push(key);
        }
      }
    }
    nextPageToken = data.nextPageToken;
    pages++;
  } while (nextPageToken && pages < 10);
  return { products, accountIssues };
}

// ── Delete Merchant product ─────────────────────────────────────
async function deleteGoogleProduct(accessToken: string, merchantId: string, productId: string): Promise<{ ok: boolean; error?: string }> {
  const url = `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/products/${encodeURIComponent(productId)}`;
  try {
    const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok || res.status === 404) return { ok: true };
    return { ok: false, error: (await res.text()).substring(0, 300) };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

// ── Validate image URL ──────────────────────────────────────────
const VALID_IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|webp)(\?.*)?$/i;

function diagnoseImageUrl(url: string | undefined | null): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!url || url.trim() === "") { issues.push("empty_url"); return { valid: false, issues }; }
  if (/\s/.test(url)) issues.push("contains_whitespace");
  if (!url.startsWith("http")) issues.push("not_absolute_url");
  if (!VALID_IMAGE_EXTENSIONS.test(url)) issues.push("no_valid_extension");
  if (url.replace(/\?.*$/, "").endsWith("-")) issues.push("url_ends_with_dash");
  // Check for duplicated URL fragments
  try {
    const u = new URL(url);
    const path = u.pathname;
    const segments = path.split("/").filter(Boolean);
    const dupes = segments.filter((s, i) => segments.indexOf(s) !== i);
    if (dupes.length > 0) issues.push("duplicated_path_segments");
  } catch { issues.push("unparseable_url"); }
  // Check for extra text after URL
  if (/\s+\S/.test(url.trim())) issues.push("additional_text_found");
  // Control chars
  if (/[\x00-\x1F]/.test(url)) issues.push("control_characters");

  return { valid: issues.length === 0, issues };
}

// ── Known valid Google category IDs (top-level pet supplies) ────
const VALID_CATEGORY_IDS = new Set([
  // Animals & Pet Supplies
  2, 3, 4, 5, 6, 7, 8, 500, 501, 502, 503, 504, 505, 506,
  // Pet Supplies subtree common IDs
  1031, 1032, 1033, 1034, 1035, 1036, 1037, 1038, 1039,
  3237, 3367, 3530, 5093, 5094, 5095, 5096, 5097,
  // Common valid top-level
  166, 469, 988, 1011,
]);

function isValidGoogleCategory(cat: string | number | null | undefined): boolean {
  if (cat === null || cat === undefined) return true; // omitted is fine
  const num = typeof cat === "string" ? parseInt(cat, 10) : cat;
  if (isNaN(num) || num <= 0) return false;
  // Any positive integer is technically valid in the taxonomy
  return num > 0 && num < 100000;
}

// ── Fetch local export set ──────────────────────────────────────
async function fetchLocalExportIds(supabase: any): Promise<Set<string>> {
  const ids = new Set<string>();
  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data } = await supabase
      .from("products")
      .select("id")
      .eq("is_active", true)
      .gt("price", 0)
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (!data || data.length === 0) { hasMore = false; break; }
    for (const p of data) ids.add(`getpawsy_${p.id}`);
    if (data.length < PAGE_SIZE) hasMore = false; else offset += PAGE_SIZE;
  }
  return ids;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Auth ─────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return new Response(JSON.stringify({ ok: false, error: "Invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleData) return new Response(JSON.stringify({ ok: false, error: "Admin required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // ── Parse action ─────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const action: string = body.action || "diagnose"; // diagnose | cleanup_preview | cleanup_run | category_preview | category_run | image_preview | image_run
    const maxDeletes = body.maxDeletes || 100;

    console.log(`[merchant-cleanup] START action=${action}`);

    // ── Get OAuth token ──────────────────────────────────────────
    const { data: tokenRecord } = await supabase
      .from("merchant_oauth_tokens")
      .select("*")
      .eq("is_connected", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tokenRecord) {
      return new Response(JSON.stringify({ ok: false, error: "Not connected to Google Merchant" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const encryptionKey = Deno.env.get("TOKEN_ENCRYPTION_KEY")!;
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
    const merchantId = tokenRecord.merchant_center_id || Deno.env.get("GOOGLE_MERCHANT_ID");
    if (!merchantId || merchantId.length < 9) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid Merchant ID" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let refreshToken: string;
    try { refreshToken = await decryptToken(tokenRecord.encrypted_refresh_token, encryptionKey); }
    catch { return new Response(JSON.stringify({ ok: false, error: "Token decryption failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

    const tokenResult = await refreshAccessToken(refreshToken, clientId, clientSecret);
    if (!tokenResult) {
      return new Response(JSON.stringify({ ok: false, error: "Token refresh failed. Reconnect Google Merchant." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const accessToken = tokenResult.access_token;

    // ── Fetch Merchant data ──────────────────────────────────────
    const [merchantProducts, statusResult, localExportIds] = await Promise.all([
      listMerchantProducts(accessToken, merchantId),
      listProductStatuses(accessToken, merchantId),
      fetchLocalExportIds(supabase),
    ]);

    const { data: dbStats } = await supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true).gt("price", 0);
    const localActiveCount = (dbStats as any)?.length ?? localExportIds.size;

    // ── Last sync ────────────────────────────────────────────────
    const { data: lastSync } = await supabase
      .from("merchant_sync_logs")
      .select("status, completed_at, sent_count, debug_report")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const latestLiveSyncSucceeded = lastSync?.status === "completed" && (lastSync?.sent_count ?? 0) > 0;

    // ══════════════════════════════════════════════════════════════
    // DIAGNOSTICS ANALYSIS (always computed)
    // ══════════════════════════════════════════════════════════════

    // ── Legacy / Stale detection ─────────────────────────────────
    const staleProducts = merchantProducts.filter(p => {
      if (!p.offerId.startsWith("getpawsy_")) return false;
      return !localExportIds.has(p.offerId);
    });
    const nonPrefixProducts = merchantProducts.filter(p => !p.offerId.startsWith("getpawsy_"));

    // ── Issue classification ─────────────────────────────────────
    const issueGroups: Record<string, { level: string; count: number; samples: string[] }> = {};
    let policyAccountIssues: string[] = statusResult.accountIssues;
    let productsWithCategoryIssues = 0;
    let productsWithImageIssues = 0;
    let productsWithPolicyIssues = 0;

    const categoryIssueKeywords = ["category", "google_product_category", "invalid product category"];
    const imageIssueKeywords = ["image not processed", "unable to show image", "invalid image encoding", "additional_image_link", "image"];
    const policyKeywords = ["suspended", "policy violation", "policy"];

    for (const p of statusResult.products) {
      for (const issue of p.issues) {
        const desc = (issue.description || "").toLowerCase();
        let level = "product_data";
        if (categoryIssueKeywords.some(k => desc.includes(k))) { level = "category"; productsWithCategoryIssues++; }
        else if (imageIssueKeywords.some(k => desc.includes(k))) { level = "image"; productsWithImageIssues++; }
        else if (policyKeywords.some(k => desc.includes(k))) { level = "policy"; productsWithPolicyIssues++; }

        const key = issue.description || "unknown";
        if (!issueGroups[key]) issueGroups[key] = { level, count: 0, samples: [] };
        issueGroups[key].count++;
        if (issueGroups[key].samples.length < 3) issueGroups[key].samples.push(p.offerId);
      }
    }

    // ── Category analysis ────────────────────────────────────────
    const invalidCategoryProducts: Array<{ offerId: string; title: string; currentCategory: string; valid: boolean }> = [];
    for (const p of merchantProducts) {
      if (p.googleProductCategory) {
        const valid = isValidGoogleCategory(p.googleProductCategory);
        if (!valid) {
          invalidCategoryProducts.push({
            offerId: p.offerId, title: p.title || "",
            currentCategory: String(p.googleProductCategory), valid: false,
          });
        }
      }
    }

    // ── Image analysis ───────────────────────────────────────────
    const imageIssueProducts: Array<{ offerId: string; title: string; imageLink: string; issues: string[]; additionalImageIssues: Array<{ url: string; issues: string[] }> }> = [];
    for (const p of merchantProducts) {
      const primaryDiag = diagnoseImageUrl(p.imageLink);
      const addlIssues: Array<{ url: string; issues: string[] }> = [];
      if (p.additionalImageLinks) {
        for (const addl of p.additionalImageLinks) {
          const d = diagnoseImageUrl(addl);
          if (!d.valid) addlIssues.push({ url: (addl || "").substring(0, 120), issues: d.issues });
        }
      }
      if (!primaryDiag.valid || addlIssues.length > 0) {
        imageIssueProducts.push({
          offerId: p.offerId, title: p.title || "",
          imageLink: (p.imageLink || "").substring(0, 120),
          issues: primaryDiag.issues,
          additionalImageIssues: addlIssues,
        });
      }
    }

    // ── Policy isolation ─────────────────────────────────────────
    const accountLevelPolicyIssueDetected = policyAccountIssues.length > 0;
    const productLevelPolicyIssueDetected = productsWithPolicyIssues > 0 && !accountLevelPolicyIssueDetected;

    // ══════════════════════════════════════════════════════════════
    // ACTION: diagnose (default)
    // ══════════════════════════════════════════════════════════════
    if (action === "diagnose") {
      const productsWithAnyIssue = statusResult.products.filter(p => p.issues.length > 0).length;
      const report = {
        ok: true, action: "diagnose",
        timestamp: new Date().toISOString(),
        overview: {
          merchantProductCount: merchantProducts.length,
          localActiveCount: localExportIds.size,
          localExportedCount: localExportIds.size,
          productsWithIssues: productsWithAnyIssue,
          issueGroupCount: Object.keys(issueGroups).length,
        },
        issueBreakdown: {
          policy_account: { count: policyAccountIssues.length, issues: policyAccountIssues },
          product_data: { count: Object.values(issueGroups).filter(g => g.level === "product_data").reduce((s, g) => s + g.count, 0) },
          category: { count: productsWithCategoryIssues, invalidProducts: invalidCategoryProducts.length },
          image: { count: productsWithImageIssues, productsWithImageIssuesLocal: imageIssueProducts.length },
          legacy_stale: { staleCount: staleProducts.length, nonPrefixCount: nonPrefixProducts.length },
        },
        issueGroups: Object.entries(issueGroups).sort(([, a], [, b]) => b.count - a.count).slice(0, 20).map(([desc, g]) => ({
          description: desc, level: g.level, count: g.count, samples: g.samples,
        })),
        legacy: {
          staleCount: staleProducts.length,
          staleOfferIds: staleProducts.slice(0, 30).map(p => p.offerId),
          nonPrefixCount: nonPrefixProducts.length,
          nonPrefixSample: nonPrefixProducts.slice(0, 10).map(p => p.offerId),
        },
        categoryHealth: {
          invalidCategoryCount: invalidCategoryProducts.length,
          sampleInvalidProducts: invalidCategoryProducts.slice(0, 10),
        },
        imageHealth: {
          imageIssueCount: imageIssueProducts.length,
          sampleImageIssues: imageIssueProducts.slice(0, 10),
        },
        policyIsolation: {
          latestLiveSyncSucceeded,
          accountLevelPolicyIssueDetected,
          productLevelPolicyIssueDetected,
          policyIssueSummary: policyAccountIssues.length > 0
            ? `ACCOUNT LEVEL: ${policyAccountIssues.join("; ")}. This affects ALL products regardless of feed quality.`
            : productsWithPolicyIssues > 0
              ? `${productsWithPolicyIssues} products have product-level policy flags.`
              : "No policy issues detected.",
        },
        healthReport: {
          exportedCount: localExportIds.size,
          successCount: lastSync?.sent_count ?? 0,
          staleMerchantItemsCount: staleProducts.length,
          invalidCategoryCount: invalidCategoryProducts.length,
          imageIssueCount: imageIssueProducts.length,
          policyAccountIssue: accountLevelPolicyIssueDetected,
          policyProductIssue: productLevelPolicyIssueDetected,
          recommendedNextActions: generateRecommendations({
            staleCount: staleProducts.length,
            invalidCategoryCount: invalidCategoryProducts.length,
            imageIssueCount: imageIssueProducts.length,
            accountLevelPolicy: accountLevelPolicyIssueDetected,
            latestLiveSyncSucceeded,
            policyIssues: policyAccountIssues,
          }),
        },
      };

      return new Response(JSON.stringify(report), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ══════════════════════════════════════════════════════════════
    // ACTION: cleanup_preview / cleanup_run
    // ══════════════════════════════════════════════════════════════
    if (action === "cleanup_preview" || action === "cleanup_run") {
      const isPreview = action === "cleanup_preview";
      const toDelete = staleProducts.slice(0, maxDeletes);
      let deletedCount = 0, deleteErrors = 0;
      const deletedOfferIds: string[] = [];
      const skippedOfferIds: string[] = [];
      const deleteErrorDetails: Array<{ offerId: string; error: string }> = [];

      if (!isPreview) {
        for (const sp of toDelete) {
          const result = await deleteGoogleProduct(accessToken, merchantId, sp.id);
          if (result.ok) { deletedCount++; deletedOfferIds.push(sp.offerId); }
          else { deleteErrors++; deleteErrorDetails.push({ offerId: sp.offerId, error: result.error || "unknown" }); }
        }
        skippedOfferIds.push(...staleProducts.slice(maxDeletes).map(p => p.offerId));
      }

      return new Response(JSON.stringify({
        ok: true, action,
        timestamp: new Date().toISOString(),
        preview: isPreview,
        staleCount: staleProducts.length,
        toDeleteCount: toDelete.length,
        deletedCount: isPreview ? 0 : deletedCount,
        deleteErrors: isPreview ? 0 : deleteErrors,
        deleteErrorDetails: deleteErrorDetails.slice(0, 10),
        deletedOfferIds: isPreview ? toDelete.map(p => p.offerId) : deletedOfferIds,
        skippedOfferIds: isPreview ? staleProducts.slice(maxDeletes).map(p => p.offerId).slice(0, 20) : skippedOfferIds.slice(0, 20),
        remainingStale: Math.max(0, staleProducts.length - maxDeletes),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ══════════════════════════════════════════════════════════════
    // ACTION: category_preview / category_run
    // ══════════════════════════════════════════════════════════════
    if (action === "category_preview" || action === "category_run") {
      // Scan local DB products for invalid categories
      const PAGE_SIZE = 1000;
      let offset = 0;
      let invalidCount = 0, correctedCount = 0, omittedCount = 0;
      const sampleInvalid: Array<{ id: string; name: string; currentCategory: string; action: string }> = [];
      const isPreview = action === "category_preview";

      let hasMore = true;
      while (hasMore) {
        const { data: prods } = await supabase
          .from("products")
          .select("id, name, category, google_product_category")
          .eq("is_active", true)
          .gt("price", 0)
          .order("id")
          .range(offset, offset + PAGE_SIZE - 1);

        if (!prods || prods.length === 0) { hasMore = false; break; }

        for (const p of prods) {
          const cat = p.google_product_category;
          if (cat !== null && cat !== undefined) {
            const valid = isValidGoogleCategory(cat);
            if (!valid) {
              invalidCount++;
              const actionTaken = "would_omit";
              if (sampleInvalid.length < 20) {
                sampleInvalid.push({ id: p.id, name: p.name, currentCategory: String(cat), action: actionTaken });
              }
              if (!isPreview) {
                // Omit invalid category by setting to null
                await supabase.from("products").update({ google_product_category: null }).eq("id", p.id);
                omittedCount++;
              }
            }
          }
        }
        if (prods.length < PAGE_SIZE) hasMore = false; else offset += PAGE_SIZE;
      }

      return new Response(JSON.stringify({
        ok: true, action,
        timestamp: new Date().toISOString(),
        preview: isPreview,
        invalidCategoryCount: invalidCount,
        correctedCategoryCount: correctedCount,
        omittedCategoryCount: isPreview ? invalidCount : omittedCount,
        sampleInvalidProducts: sampleInvalid,
        merchantInvalidCount: invalidCategoryProducts.length,
        merchantInvalidSample: invalidCategoryProducts.slice(0, 10),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ══════════════════════════════════════════════════════════════
    // ACTION: image_preview / image_run
    // ══════════════════════════════════════════════════════════════
    if (action === "image_preview" || action === "image_run") {
      const isPreview = action === "image_preview";
      let fixedCount = 0, removedAdditionalCount = 0;
      const imageFixSamples: Array<{ id: string; name: string; field: string; issue: string; action: string }> = [];

      // Scan local DB products for image issues
      const PAGE_SIZE = 500;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: prods } = await supabase
          .from("products")
          .select("id, name, image_url, images")
          .eq("is_active", true)
          .gt("price", 0)
          .order("id")
          .range(offset, offset + PAGE_SIZE - 1);

        if (!prods || prods.length === 0) { hasMore = false; break; }

        for (const p of prods) {
          // Check primary image
          const primaryDiag = diagnoseImageUrl(p.image_url);
          if (!primaryDiag.valid && p.image_url) {
            const trimmed = (p.image_url || "").trim();
            if (trimmed !== p.image_url && trimmed.startsWith("http")) {
              if (imageFixSamples.length < 20) imageFixSamples.push({ id: p.id, name: p.name, field: "image_url", issue: primaryDiag.issues.join(", "), action: "trim_whitespace" });
              if (!isPreview) { await supabase.from("products").update({ image_url: trimmed }).eq("id", p.id); fixedCount++; }
            }
          }

          // Check additional images
          if (p.images && Array.isArray(p.images)) {
            const cleaned: string[] = [];
            let anyRemoved = false;
            for (const img of p.images as string[]) {
              if (!img || typeof img !== "string") { anyRemoved = true; continue; }
              const d = diagnoseImageUrl(img);
              if (!d.valid) {
                anyRemoved = true;
                removedAdditionalCount++;
                if (imageFixSamples.length < 20) imageFixSamples.push({ id: p.id, name: p.name, field: "additional_image", issue: d.issues.join(", "), action: "remove" });
              } else {
                cleaned.push(img.trim());
              }
            }
            if (anyRemoved && !isPreview) {
              await supabase.from("products").update({ images: cleaned }).eq("id", p.id);
            }
          }
        }
        if (prods.length < PAGE_SIZE) hasMore = false; else offset += PAGE_SIZE;
      }

      return new Response(JSON.stringify({
        ok: true, action,
        timestamp: new Date().toISOString(),
        preview: isPreview,
        imageIssueCount: imageIssueProducts.length,
        fixedImageCount: isPreview ? 0 : fixedCount,
        removedAdditionalImagesCount: isPreview ? removedAdditionalCount : removedAdditionalCount,
        imageFailuresRemaining: Math.max(0, imageIssueProducts.length - fixedCount - removedAdditionalCount),
        samples: imageFixSamples,
        merchantImageIssues: imageIssueProducts.slice(0, 10),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: false, error: `Unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[merchant-cleanup] Error:", err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function generateRecommendations(ctx: {
  staleCount: number; invalidCategoryCount: number; imageIssueCount: number;
  accountLevelPolicy: boolean; latestLiveSyncSucceeded: boolean; policyIssues: string[];
}): string[] {
  const recs: string[] = [];
  if (ctx.latestLiveSyncSucceeded) recs.push("✅ Live sync succeeded — products accepted by Google API");
  else recs.push("⚠️ No recent successful live sync — run a live sync first");
  if (ctx.accountLevelPolicy) recs.push(`🚫 ACCOUNT-LEVEL policy block active: ${ctx.policyIssues.join("; ")}. This must be resolved via Google Merchant Center reconsideration.`);
  if (ctx.staleCount > 0) recs.push(`🗑️ ${ctx.staleCount} stale legacy items in Merchant — run cleanup to remove`);
  if (ctx.invalidCategoryCount > 0) recs.push(`📂 ${ctx.invalidCategoryCount} products have invalid google_product_category — run category repair`);
  if (ctx.imageIssueCount > 0) recs.push(`🖼️ ${ctx.imageIssueCount} products have image issues — run image repair`);
  if (recs.length === 1 && ctx.latestLiveSyncSucceeded && !ctx.accountLevelPolicy) recs.push("🎉 All clear — no cleanup actions needed");
  return recs;
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FailureBucket {
  reason: string;
  count: number;
  examples: Array<{
    id: string;
    name: string | null;
    price: number | null;
    stock: number | null;
    is_active: boolean | null;
    has_image: boolean;
    has_description: boolean;
    weight: number | null;
  }>;
}

interface DebugReport {
  timestamp: string;
  environment: {
    supabaseUrlOrigin: string;
    merchantIdConfigured: boolean;
    serviceAccountConfigured: boolean;
    oauthConfigured: boolean;
    encryptionKeyConfigured: boolean;
  };
  sourceEnumeration: {
    table: string;
    query: string;
    rawCount: number;
    rawCountError: string | null;
    zeroReasonChecks: {
      tableExists: boolean;
      totalRowsInTable: number;
      activeProducts: number;
      productsWithPrice: number;
      productsActiveAndPriced: number;
    } | null;
  };
  eligibilityFiltering: {
    eligibleCount: number;
    failureBuckets: FailureBucket[];
  };
  payloadBuild: {
    payloadItemsBuilt: number;
    explanation: string;
  };
  googleApiStage: {
    wouldCallEndpoint: string | null;
    merchantId: string | null;
    authMethod: string;
  };
  pipeline: {
    rawCount: number;
    eligibleCount: number;
    payloadBuiltCount: number;
    sentCount: number;
  };
  topFailureReasons: Array<{ reason: string; count: number }>;
  minimumViableExport: {
    possible: boolean;
    sampleProducts: Array<{
      id: string;
      name: string | null;
      price: number | null;
      availability: string;
      imageLink: string | null;
      missingFields: string[];
    }>;
    explanation: string;
  };
}

// Minimal weight/image validation matching cj-google-sync logic
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

function isValidImageUrl(url: string | null): boolean {
  if (!url || url.trim() === "") return false;
  if (!url.startsWith("https://") && !url.startsWith("http://")) return false;
  if (url.includes(" ") || url.length < 15) return false;
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);
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

    const merchantId = Deno.env.get("GOOGLE_MERCHANT_ID") || Deno.env.get("GOOGLE_MERCHANT_CENTER_ID") || null;
    const serviceAccountConfigured = !!Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    const oauthConfigured = !!Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") && !!Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
    const encryptionKeyConfigured = !!Deno.env.get("TOKEN_ENCRYPTION_KEY");

    // ── STEP A: Source Enumeration ──────────────────────────────────
    // This mirrors the exact query used in cj-google-sync
    const queryDesc = "products table: is_active=true, price>0, ordered by id";

    // Total rows in table (no filters)
    const { count: totalRows, error: totalErr } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true });

    // Active only
    const { count: activeCount } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    // With price > 0
    const { count: pricedCount } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .gt("price", 0);

    // Active AND priced (the actual sync query)
    const { count: syncQueryCount, error: syncQueryErr } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .gt("price", 0);

    const rawCount = syncQueryCount ?? 0;

    // Fetch actual products for eligibility analysis (limit 500 for performance)
    const { data: products, error: productsErr } = await supabase
      .from("products")
      .select("id, name, slug, description, price, image_url, stock, weight, is_active, images")
      .eq("is_active", true)
      .gt("price", 0)
      .order("id")
      .limit(500);

    // ── STEP B: Eligibility Filtering ───────────────────────────────
    const buckets: Record<string, { count: number; examples: FailureBucket["examples"] }> = {
      missing_price: { count: 0, examples: [] },
      invalid_price: { count: 0, examples: [] },
      missing_title: { count: 0, examples: [] },
      missing_description: { count: 0, examples: [] },
      missing_image: { count: 0, examples: [] },
      weight_over_30kg: { count: 0, examples: [] },
      missing_stock_oos: { count: 0, examples: [] },
      inactive: { count: 0, examples: [] },
    };

    let eligibleCount = 0;
    const eligibleProducts: typeof products = [];

    function addToBucket(key: string, p: any) {
      const b = buckets[key];
      b.count++;
      if (b.examples.length < 10) {
        b.examples.push({
          id: p.id,
          name: p.name?.substring(0, 60) || null,
          price: p.price,
          stock: p.stock,
          is_active: p.is_active,
          has_image: isValidImageUrl(p.image_url),
          has_description: !!(p.description && p.description.length > 0),
          weight: p.weight,
        });
      }
    }

    for (const p of products || []) {
      let failed = false;

      // These are already filtered by query, but double-check
      if (!p.price || p.price <= 0) {
        addToBucket(p.price === null || p.price === undefined ? "missing_price" : "invalid_price", p);
        failed = true;
      }

      if (!p.name || p.name.trim() === "") {
        addToBucket("missing_title", p);
        failed = true;
      }

      if (!p.description || p.description.trim() === "") {
        addToBucket("missing_description", p);
        // NOT a hard fail in cj-google-sync (it falls back to name)
      }

      if (!isValidImageUrl(p.image_url)) {
        addToBucket("missing_image", p);
        // NOT a hard fail in cj-google-sync (it uses placeholder)
      }

      const weightKg = normalizeWeight(p.weight, p.name || "");
      if (weightKg > 30) {
        addToBucket("weight_over_30kg", p);
        failed = true;
      }

      // Stock check - note: cj-google-sync does NOT skip OOS, it sets availability="out of stock"
      if (!p.stock || p.stock <= 0) {
        addToBucket("missing_stock_oos", p);
        // NOT a hard fail - just gets "out of stock" availability
      }

      if (!failed) {
        eligibleCount++;
        eligibleProducts!.push(p);
      }
    }

    // ── STEP C: Payload Build ───────────────────────────────────────
    const payloadBuiltCount = eligibleCount;
    let payloadExplanation = "";
    if (rawCount === 0) {
      payloadExplanation = "No products matched the source query (is_active=true AND price>0). Nothing to build.";
    } else if (eligibleCount === 0) {
      payloadExplanation = "All products failed eligibility checks. See failure buckets for details.";
    } else {
      payloadExplanation = `${payloadBuiltCount} products would be built into Google Merchant payloads.`;
    }

    // ── STEP D: Google API Stage ────────────────────────────────────
    const authMethod = serviceAccountConfigured
      ? "Service Account (cj-google-sync)"
      : oauthConfigured
      ? "OAuth2 (merchant-sync reads statuses only)"
      : "NONE CONFIGURED";

    // ── Minimum Viable Export ───────────────────────────────────────
    const REQUIRED_FIELDS = ["title", "price", "imageLink", "availability", "link"];
    const mveProducts: DebugReport["minimumViableExport"]["sampleProducts"] = [];

    for (const p of (eligibleProducts || []).slice(0, 10)) {
      const missing: string[] = [];
      if (!p.name || p.name.trim() === "") missing.push("title");
      if (!p.price || p.price <= 0) missing.push("price");
      if (!isValidImageUrl(p.image_url)) missing.push("imageLink (using placeholder)");
      if (!p.slug) missing.push("link (no slug)");

      mveProducts.push({
        id: p.id,
        name: p.name?.substring(0, 60) || null,
        price: p.price,
        availability: p.stock && p.stock > 0 ? "in stock" : "out of stock",
        imageLink: p.image_url?.substring(0, 80) || null,
        missingFields: missing,
      });
    }

    // ── Build failure reasons sorted ────────────────────────────────
    const failureBuckets: FailureBucket[] = Object.entries(buckets)
      .filter(([, v]) => v.count > 0)
      .map(([reason, v]) => ({ reason, count: v.count, examples: v.examples }))
      .sort((a, b) => b.count - a.count);

    const topFailureReasons = failureBuckets
      .slice(0, 5)
      .map((b) => ({ reason: b.reason, count: b.count }));

    // ── Assemble Report ─────────────────────────────────────────────
    const report: DebugReport = {
      timestamp: new Date().toISOString(),
      environment: {
        supabaseUrlOrigin: new URL(supabaseUrl).origin,
        merchantIdConfigured: !!merchantId,
        serviceAccountConfigured,
        oauthConfigured,
        encryptionKeyConfigured,
      },
      sourceEnumeration: {
        table: "public.products",
        query: queryDesc,
        rawCount,
        rawCountError: syncQueryErr?.message || productsErr?.message || totalErr?.message || null,
        zeroReasonChecks: rawCount === 0
          ? {
              tableExists: totalRows !== null,
              totalRowsInTable: totalRows ?? 0,
              activeProducts: activeCount ?? 0,
              productsWithPrice: pricedCount ?? 0,
              productsActiveAndPriced: rawCount,
            }
          : null,
      },
      eligibilityFiltering: {
        eligibleCount,
        failureBuckets,
      },
      payloadBuild: {
        payloadItemsBuilt: payloadBuiltCount,
        explanation: payloadExplanation,
      },
      googleApiStage: {
        wouldCallEndpoint: payloadBuiltCount > 0
          ? `POST https://shoppingcontent.googleapis.com/content/v2.1/{merchantId}/products`
          : null,
        merchantId: merchantId ? `${merchantId.substring(0, 4)}...` : null,
        authMethod,
      },
      pipeline: {
        rawCount,
        eligibleCount,
        payloadBuiltCount,
        sentCount: 0, // Dry run — nothing sent
      },
      topFailureReasons,
      minimumViableExport: {
        possible: mveProducts.length > 0 && mveProducts.some((p) => p.missingFields.length === 0),
        sampleProducts: mveProducts,
        explanation:
          mveProducts.length === 0
            ? "No eligible products found for minimum viable export."
            : mveProducts.every((p) => p.missingFields.length === 0)
            ? `All ${mveProducts.length} sample products have all required Merchant fields.`
            : `Some products have missing fields: ${[...new Set(mveProducts.flatMap((p) => p.missingFields))].join(", ")}`,
      },
    };

    // ── Store in merchant_sync_logs ──────────────────────────────────
    await supabase.from("merchant_sync_logs").insert({
      sync_type: "debug_dry_run",
      status: "completed",
      total_products: rawCount,
      products_with_issues: rawCount - eligibleCount,
      issues_summary: {
        ...Object.fromEntries(failureBuckets.map((b) => [b.reason, b.count])),
        _debug_report: true,
      },
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      triggered_by: user.id,
    });

    console.log(`[merchant-debug-sync] Report: raw=${rawCount}, eligible=${eligibleCount}, payload=${payloadBuiltCount}`);

    return new Response(
      JSON.stringify({ ok: true, report }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[merchant-debug-sync] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

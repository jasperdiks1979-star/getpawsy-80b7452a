import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Weight/image validation matching cj-google-sync exactly ──────
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

  const runId = crypto.randomUUID();

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

    // Parse body
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "dryrun";
    const limit = body.limit || 1000;

    // ── ENV CONFIG STATUS ───────────────────────────────────────────
    const envConfigStatus: Record<string, boolean> = {
      GOOGLE_OAUTH_CLIENT_ID: !!Deno.env.get("GOOGLE_OAUTH_CLIENT_ID"),
      GOOGLE_OAUTH_CLIENT_SECRET: !!Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET"),
      GOOGLE_OAUTH_REDIRECT_URI: !!Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI"),
      GOOGLE_MERCHANT_ID: !!Deno.env.get("GOOGLE_MERCHANT_ID"),
      GOOGLE_SERVICE_ACCOUNT_JSON: !!Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON"),
      TOKEN_ENCRYPTION_KEY: !!Deno.env.get("TOKEN_ENCRYPTION_KEY"),
      SUPABASE_URL: !!Deno.env.get("SUPABASE_URL"),
      SUPABASE_SERVICE_ROLE_KEY: !!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      SUPABASE_ANON_KEY: !!Deno.env.get("SUPABASE_ANON_KEY"),
    };

    const merchantId = Deno.env.get("GOOGLE_MERCHANT_ID") || null;
    const hasServiceAccount = !!Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    const hasOAuth = envConfigStatus.GOOGLE_OAUTH_CLIENT_ID && envConfigStatus.GOOGLE_OAUTH_CLIENT_SECRET;

    // ── Google Auth Debug: extract GCP project info ─────────────────
    const googleAuthDebug: Record<string, unknown> = {
      authMethod: hasServiceAccount ? "service_account" : hasOAuth ? "oauth_token" : "NONE",
      project_id: null,
      client_email: null,
      client_id: null,
      merchantId: merchantId,
      token_project_number_if_available: null,
    };

    const saJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (saJson) {
      try {
        const sa = JSON.parse(saJson);
        googleAuthDebug.project_id = sa.project_id || null;
        googleAuthDebug.client_email = sa.client_email || null;
        googleAuthDebug.client_id = sa.client_id || null;
        // Extract project number from client_email domain if possible
        if (sa.client_email && sa.client_email.includes("@")) {
          googleAuthDebug.sa_email_domain = sa.client_email.split("@")[1] || null;
        }
        console.log(`[merchant-debug-sync] GCP project_id=${sa.project_id} client_email=${sa.client_email} client_id=${sa.client_id}`);
      } catch (e) {
        googleAuthDebug.parse_error = (e as Error).message;
        console.error("[merchant-debug-sync] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:", (e as Error).message);
      }
    }

    if (hasOAuth) {
      const oauthClientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "";
      // OAuth client IDs are formatted as {project_number}-{hash}.apps.googleusercontent.com
      const oauthMatch = oauthClientId.match(/^(\d+)-/);
      if (oauthMatch) {
        googleAuthDebug.token_project_number_if_available = oauthMatch[1];
      }
      googleAuthDebug.oauth_client_id = oauthClientId;
    }

    // ── STEP A: Source Enumeration (products table probes) ───────────
    // Total rows
    const { count: totalRows, error: totalErr } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true });

    // Active only
    const { count: activeCount, error: activeErr } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    // Price > 0
    const { count: pricedCount, error: pricedErr } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .gt("price", 0);

    // Active AND priced — the EXACT query cj-google-sync uses
    const { count: syncQueryCount, error: syncQueryErr } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .gt("price", 0);

    // With image present
    const { count: withImageCount } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .not("image_url", "is", null)
      .neq("image_url", "");

    // With slug present
    const { count: withSlugCount } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .not("slug", "is", null)
      .neq("slug", "");

    const rawCount = syncQueryCount ?? 0;

    const productsTableProbe = {
      totalRows: totalRows ?? 0,
      activeRows: activeCount ?? 0,
      rowsWithPriceGt0: pricedCount ?? 0,
      activeAndPriced: rawCount,
      rowsWithImage: withImageCount ?? 0,
      rowsWithSlug: withSlugCount ?? 0,
      errors: [totalErr, activeErr, pricedErr, syncQueryErr].filter(Boolean).map(e => e!.message),
    };

    // Zero-reason checks
    let zeroReasonChecks: Record<string, unknown> | null = null;
    if (rawCount === 0) {
      zeroReasonChecks = {
        tableExists: totalRows !== null && totalRows !== undefined,
        totalRowsInTable: totalRows ?? 0,
        activeProducts: activeCount ?? 0,
        productsWithPrice: pricedCount ?? 0,
        productsActiveAndPriced: rawCount,
        queryUsed: "products: is_active=true AND price>0",
        possibleCauses: [] as string[],
      };
      const causes = zeroReasonChecks.possibleCauses as string[];
      if ((totalRows ?? 0) === 0) causes.push("Products table is EMPTY — no products imported yet");
      else if ((activeCount ?? 0) === 0) causes.push("All products have is_active=false — none are active");
      else if ((pricedCount ?? 0) === 0) causes.push("All products have price=0 or NULL — no valid prices");
      else causes.push("Products exist but none match is_active=true AND price>0 simultaneously");
      if (productsTableProbe.errors.length > 0) causes.push(`DB query errors: ${productsTableProbe.errors.join("; ")}`);
    }

    // ── Fetch actual products for eligibility ────────────────────────
    const { data: products, error: productsErr } = await supabase
      .from("products")
      .select("id, name, slug, description, price, image_url, stock, weight, is_active, images, cj_product_id")
      .eq("is_active", true)
      .gt("price", 0)
      .order("id")
      .limit(limit);

    // ── STEP B: Eligibility Filtering ────────────────────────────────
    type Example = {
      id: string;
      slug: string | null;
      name: string | null;
      price: number | null;
      stock: number | null;
      has_image: boolean;
      has_description: boolean;
      weight_raw: number | null;
      weight_kg: number | null;
    };

    const bucketNames = [
      "missing_title", "missing_price", "invalid_price", "missing_image",
      "missing_link", "missing_gtin_mpn", "oos", "overweight",
      "bad_currency", "invalid_shipping", "disallowed_category",
      "missing_description", "other",
    ] as const;

    const buckets: Record<string, { count: number; examples: Example[] }> = {};
    for (const name of bucketNames) {
      buckets[name] = { count: 0, examples: [] };
    }

    let eligibleCount = 0;
    const eligibleProducts: Array<typeof products extends (infer T)[] | null ? T : never> = [];

    function addToBucket(key: string, p: any) {
      const b = buckets[key] || (buckets[key] = { count: 0, examples: [] });
      b.count++;
      if (b.examples.length < 10) {
        const wkg = normalizeWeight(p.weight, p.name || "");
        b.examples.push({
          id: p.id,
          slug: p.slug?.substring(0, 40) || null,
          name: p.name?.substring(0, 60) || null,
          price: p.price,
          stock: p.stock,
          has_image: isValidImageUrl(p.image_url),
          has_description: !!(p.description && p.description.length > 0),
          weight_raw: p.weight,
          weight_kg: wkg,
        });
      }
    }

    for (const p of products || []) {
      let failed = false;

      // Hard fails (matching cj-google-sync skip logic)
      if (!p.price || p.price <= 0) {
        addToBucket(p.price === null || p.price === undefined ? "missing_price" : "invalid_price", p);
        failed = true;
      }

      if (!p.name || p.name.trim() === "") {
        addToBucket("missing_title", p);
        failed = true;
      }

      const weightKg = normalizeWeight(p.weight, p.name || "");
      if (weightKg > 30) {
        addToBucket("overweight", p);
        failed = true;
      }

      // Soft fails (cj-google-sync uses placeholders/fallbacks, doesn't skip)
      if (!isValidImageUrl(p.image_url)) {
        addToBucket("missing_image", p);
      }

      if (!p.description || p.description.trim() === "") {
        addToBucket("missing_description", p);
      }

      if (!p.slug) {
        addToBucket("missing_link", p);
      }

      if (!p.stock || p.stock <= 0) {
        addToBucket("oos", p);
      }

      // GTIN/MPN — cj-google-sync doesn't use them but Merchant requires identifiers
      if (!p.cj_product_id) {
        addToBucket("missing_gtin_mpn", p);
      }

      if (!failed) {
        eligibleCount++;
        eligibleProducts.push(p);
      }
    }

    // ── STEP C: Payload Build ────────────────────────────────────────
    const payloadBuiltCount = eligibleCount;
    let payloadExplanation = "";
    if (rawCount === 0) {
      payloadExplanation = "No products matched source query (is_active=true AND price>0). Nothing to build.";
    } else if (eligibleCount === 0) {
      payloadExplanation = "All products failed eligibility checks. See failure buckets.";
    } else {
      payloadExplanation = `${payloadBuiltCount} products would be built into Google Merchant payloads.`;
    }

    // First 10 payload preview
    const first10Preview = eligibleProducts.slice(0, 10).map(p => ({
      offerId: p.id,
      title: (p.name || "").substring(0, 80),
      price: `${(p.price || 0).toFixed(2)} USD`,
      availability: (p.stock && p.stock > 0) ? "in stock" : "out of stock",
      link: `https://getpawsy.pet/product/${p.slug}`,
      imageLink: isValidImageUrl(p.image_url) ? p.image_url?.substring(0, 80) : "PLACEHOLDER",
      weightKg: normalizeWeight(p.weight, p.name || ""),
    }));

    // ── STEP D: Google API Stage ─────────────────────────────────────
    const authMethod = hasServiceAccount
      ? "Service Account (cj-google-sync)"
      : hasOAuth
      ? "OAuth2 (merchant-sync)"
      : "NONE CONFIGURED";

    // ── Merchant Feed Probe ──────────────────────────────────────────
    let merchantFeedProbe: { itemCount: number; firstItemIds: string[]; error?: string; flag?: string } = {
      itemCount: 0,
      firstItemIds: [],
    };
    try {
      const feedRes = await fetch("https://getpawsy.pet/merchant-feed.xml", {
        headers: { "User-Agent": "GetPawsy-DebugSync/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (feedRes.ok) {
        const feedXml = await feedRes.text();
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        const ids: string[] = [];
        let m;
        let count = 0;
        while ((m = itemRegex.exec(feedXml)) !== null) {
          count++;
          if (ids.length < 3) {
            const idMatch = m[1].match(/<g:id>(.*?)<\/g:id>/);
            if (idMatch) ids.push(idMatch[1]);
          }
        }
        merchantFeedProbe = {
          itemCount: count,
          firstItemIds: ids,
          ...(count === 0 ? { flag: "merchant-feed.xml has 0 items — feed may be empty or misconfigured" } : {}),
        };
      } else {
        merchantFeedProbe.error = `Feed returned HTTP ${feedRes.status}`;
        await feedRes.text(); // consume
      }
    } catch (e) {
      merchantFeedProbe.error = (e as Error).message;
    }

    // ── Eligibility breakdown ────────────────────────────────────────
    const eligibilityBreakdown: Record<string, number> = {};
    for (const [key, val] of Object.entries(buckets)) {
      eligibilityBreakdown[key] = val.count;
    }

    // ── Top failure reasons ──────────────────────────────────────────
    const failureBuckets = Object.entries(buckets)
      .filter(([, v]) => v.count > 0)
      .map(([reason, v]) => ({ reason, count: v.count, examples: v.examples }))
      .sort((a, b) => b.count - a.count);

    const topFailureReasons = failureBuckets.slice(0, 5).map(b => ({ reason: b.reason, count: b.count }));

    // ── Sample failures (top 10 per bucket, top 5 buckets) ──────────
    const sampleFailures = failureBuckets.slice(0, 5).map(b => ({
      reason: b.reason,
      count: b.count,
      examples: b.examples.slice(0, 10),
    }));

    // ── MVE ──────────────────────────────────────────────────────────
    const mveProducts = eligibleProducts.slice(0, 10).map(p => {
      const missing: string[] = [];
      if (!p.name?.trim()) missing.push("title");
      if (!p.price || p.price <= 0) missing.push("price");
      if (!isValidImageUrl(p.image_url)) missing.push("imageLink (using placeholder)");
      if (!p.slug) missing.push("link (no slug)");
      return {
        id: p.id,
        name: p.name?.substring(0, 60) || null,
        price: p.price,
        availability: (p.stock && p.stock > 0) ? "in stock" : "out of stock",
        imageLink: p.image_url?.substring(0, 80) || null,
        missingFields: missing,
      };
    });

    // ── Assemble full report ─────────────────────────────────────────
    const report = {
      runId,
      timestamp: new Date().toISOString(),
      mode,
      envConfigStatus,
      productsTableProbe,
      merchantFeedProbe,
      sourceEnumeration: {
        table: "public.products",
        query: "SELECT ... FROM products WHERE is_active=true AND price>0 ORDER BY id",
        rawCount,
        rawCountError: syncQueryErr?.message || productsErr?.message || null,
        zeroReasonChecks,
      },
      eligibilityBreakdown,
      eligibilityFiltering: {
        eligibleCount,
        failureBuckets: sampleFailures,
      },
      payloadBuild: {
        payloadItemsBuilt: payloadBuiltCount,
        explanation: payloadExplanation,
      },
      googleApiStage: {
        wouldCallEndpoint: payloadBuiltCount > 0
          ? "POST https://shoppingcontent.googleapis.com/content/v2.1/{merchantId}/products"
          : null,
        merchantId: merchantId ? `***${merchantId.slice(-4)}` : null,
        authMethod,
      },
      googleAuthDebug,
      pipeline: {
        rawCount,
        activeCount: activeCount ?? 0,
        pricedCount: pricedCount ?? 0,
        eligibleCount,
        payloadBuiltCount,
        sentCount: 0,
      },
      topFailureReasons,
      minimumViableExport: {
        possible: mveProducts.length > 0 && mveProducts.some(p => p.missingFields.length === 0),
        sampleProducts: mveProducts,
        explanation:
          mveProducts.length === 0
            ? "No eligible products found for minimum viable export."
            : mveProducts.every(p => p.missingFields.length === 0)
            ? `All ${mveProducts.length} sample products have all required Merchant fields.`
            : `Some products missing: ${[...new Set(mveProducts.flatMap(p => p.missingFields))].join(", ")}`,
      },
    };

    // ── Store sanitized report in merchant_sync_logs ─────────────────
    await supabase.from("merchant_sync_logs").insert({
      sync_type: "debug_dry_run",
      status: "completed",
      total_products: rawCount,
      products_with_issues: rawCount - eligibleCount,
      issues_summary: eligibilityBreakdown,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      triggered_by: user.id,
      run_id: runId,
      mode,
      raw_count: rawCount,
      active_count: activeCount ?? 0,
      priced_count: pricedCount ?? 0,
      eligible_count: eligibleCount,
      payload_built_count: payloadBuiltCount,
      sent_count: 0,
      top_failure_reasons: topFailureReasons,
      sample_failures: sampleFailures,
      env_status: envConfigStatus,
      first10_payload_preview: first10Preview,
      errors: productsTableProbe.errors.length > 0 ? productsTableProbe.errors : null,
      notes: payloadExplanation,
      debug_report: report,
    });

    console.log(`[merchant-debug-sync] runId=${runId} raw=${rawCount} eligible=${eligibleCount} payload=${payloadBuiltCount}`);

    return new Response(
      JSON.stringify({ ok: true, report }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[merchant-debug-sync] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message, runId }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

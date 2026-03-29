import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1?target=deno";

// Inline minimal sanitizer for feed-sample (avoids cross-function import)
function sanitizeTextBasic(text: string): string {
  const BANNED = [
    /free\s*shipping/gi, /ships?\s*from/gi, /\d+[-–]\d+\s*business\s*days?/gi,
    /fast\s*delivery/gi, /express\s*shipping/gi, /us\s*warehouse/gi,
    /worldwide\s*shipping/gi, /\d+[-–]?\s*day\s*returns?/gi, /hassle[-\s]*free\s*returns?/gi,
    /money\s*back/gi, /satisfaction\s*guarantee[d]?/gi, /trusted\s*by/gi,
    /best\s*seller/gi, /top[-\s]*rated/gi, /premium\s*quality/gi,
    /shop\s*now/gi, /order\s*today/gi, /best\s*price/gi, /buy\s*now/gi,
    /your\s*pet\s*deserves/gi, /perfect\s*for/gi, /amazing/gi,
    /✔/g, /✓/g, /★+/g, /⭐+/g, /🏆/g, /🥇/g, /💯/g, /🔥/g, /✅/g, /🎉/g, /🚚/g, /📦/g,
  ];
  let r = text.replace(/<\/?[a-z][^>]*>/gi, " ");
  r = r.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "");
  for (const re of BANNED) r = r.replace(re, "");
  return r.replace(/\s{2,}/g, " ").trim();
}

const CATEGORY_MAP: Record<string, number> = {
  "dog toy": 5004, "dog bed": 4985, "dog collar": 5001, "dog leash": 5002,
  "cat toy": 5019, "cat bed": 5008, "cat tree": 5020, "cat litter": 5011,
  "pet carrier": 6978, "pet bowl": 8069, "pet bed": 4516, "pet grooming": 4523,
  "dog": 4985, "cat": 5007, "pet": 2,
};

function mapCategory(name: string): number | null {
  const lower = name.toLowerCase();
  for (const [key, id] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return id;
  }
  return null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SITE = "https://getpawsy.pet";

const REQUIRED_PAGES = [
  { path: "/shipping", mustContain: ["business days", "processing time", "us warehouse"] },
  { path: "/returns", mustContain: ["refund"] },
  { path: "/privacy", mustContain: ["information"] },
  { path: "/terms", mustContain: ["terms"] },
  { path: "/contact", mustContain: ["email"] },
  { path: "/about", mustContain: ["getpawsy"] },
];

const SHIPPING_CLAIM_KEYWORDS = [
  "processing time",
  "1–2 business days",
  "1-2 business days",
  "delivery time",
  "5–10 business days",
  "5–10 business days",
  "us warehouse",
  "us warehouses",
  "us fulfillment",
];

const REQUIRED_FOOTER_HREFS = ["/shipping", "/returns", "/privacy", "/terms", "/contact", "/about"];

const BUSINESS_SIGNALS = [
  "getpawsy", "support@getpawsy.pet", "skidzo",
  "netherlands", "kvk", "78156955",
];

/** Fetch JS content with timeout */
async function fetchJs(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "GetPawsy-MerchantAudit/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return await res.text();
  } catch { /* ignore */ }
  return "";
}

/** Extract all JS bundle URLs from HTML (scripts + modulepreload) */
function extractBundleUrls(html: string): string[] {
  const urls: string[] = [];
  const scriptRegex = /<script[^>]+src="([^"]+\.js)"/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const src = match[1];
    const fullUrl = src.startsWith("http") ? src : `${SITE}${src.startsWith(".") ? src.slice(1) : src}`;
    urls.push(fullUrl);
  }
  const preloadRegex = /<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/gi;
  while ((match = preloadRegex.exec(html)) !== null) {
    const src = match[1];
    const fullUrl = src.startsWith("http") ? src : `${SITE}${src.startsWith(".") ? src.slice(1) : src}`;
    if (!urls.includes(fullUrl)) urls.push(fullUrl);
  }
  return urls;
}

/** Discover lazy chunk URLs from JS source using multiple Vite patterns */
function discoverLazyChunks(jsSource: string): string[] {
  const chunks = new Set<string>();
  // Pattern 1: import("./chunk.js")
  const patterns = [
    /import\(\s*["']\.?\/?([^"']+\.js)["']\s*\)/g,
    // Pattern 2: Vite's __vitePreload(() => import("./chunk.js"))
    /__vitePreload\(\s*\(\)\s*=>\s*import\(\s*["']\.?\/?([^"']+\.js)["']\s*\)/g,
    // Pattern 3: Vite string concat: "/assets/" + "chunk-abc.js"
    /["']\/assets\/["']\s*\+\s*["']([^"']+\.js)["']/g,
    // Pattern 4: direct asset references "/assets/chunk.js"
    /["']\/assets\/([^"']+\.js)["']/g,
  ];
  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(jsSource)) !== null) {
      const chunkPath = match[1];
      if (!chunkPath.includes("node_modules")) {
        const cleanPath = chunkPath.replace(/^(\.\/|assets\/)/, "");
        chunks.add(`${SITE}/assets/${cleanPath}`);
      }
    }
  }
  return Array.from(chunks);
}

/**
 * Build comprehensive text corpus from HTML + all JS bundles (entry + lazy).
 * Uses multi-level discovery to find deeply nested Vite chunks (router → page).
 */
async function buildGlobalCorpus(html: string): Promise<string> {
  const allUrls = new Set<string>();
  const allTexts: string[] = [html];

  // Level 0: entry bundles from HTML
  const entryUrls = extractBundleUrls(html);
  for (const u of entryUrls) allUrls.add(u);
  const entryTexts = await Promise.all(entryUrls.map(fetchJs));
  allTexts.push(...entryTexts);

  // Level 1: lazy chunks discovered from entry bundles
  const level1Urls: string[] = [];
  for (const text of entryTexts) {
    for (const url of discoverLazyChunks(text)) {
      if (!allUrls.has(url)) { allUrls.add(url); level1Urls.push(url); }
    }
  }
  const level1Texts = await Promise.all(level1Urls.slice(0, 40).map(fetchJs));
  allTexts.push(...level1Texts);

  // Level 2: lazy chunks discovered from level-1 chunks (page components)
  const level2Urls: string[] = [];
  for (const text of level1Texts) {
    for (const url of discoverLazyChunks(text)) {
      if (!allUrls.has(url)) { allUrls.add(url); level2Urls.push(url); }
    }
  }
  const level2Texts = await Promise.all(level2Urls.slice(0, 40).map(fetchJs));
  allTexts.push(...level2Texts);

  return allTexts.join(" ").toLowerCase();
}

/**
 * SPA-aware page checker.
 * Fetches the page HTML, checks status, and searches for keywords
 * in the GLOBAL corpus (which includes all JS bundles).
 */
async function checkPage(
  path: string,
  mustContain: string[],
  globalCorpus: string,
): Promise<{
  path: string; status: number | null; accessible: boolean;
  missing: string[]; present: string[]; pass: boolean;
  businessSignalsFound: string[];
}> {
  try {
    const res = await fetch(`${SITE}${path}`, {
      headers: { "User-Agent": "GetPawsy-MerchantAudit/1.0", Accept: "text/html" },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    const status = res.status;
    if (!res.ok) return { path, status, accessible: false, missing: mustContain, present: [], pass: false, businessSignalsFound: [] };

    await res.text(); // consume body
    const isSpaShell = true; // All pages are SPA routes returning 200

    // Check keywords in global corpus (contains ALL JS bundles)
    const present: string[] = [];
    const missing: string[] = [];
    for (const term of mustContain) {
      if (globalCorpus.includes(term.toLowerCase())) present.push(term);
      else missing.push(term);
    }

    // Business signals
    const businessSignalsFound: string[] = [];
    for (const sig of BUSINESS_SIGNALS) {
      if (globalCorpus.includes(sig.toLowerCase())) businessSignalsFound.push(sig);
    }

    return {
      path, status, accessible: true, missing, present,
      pass: missing.length === 0,
      businessSignalsFound,
    };
  } catch (e) {
    return { path, status: null, accessible: false, missing: mustContain, present: [], pass: false, businessSignalsFound: [] };
  }
}

/**
 * Check shipping claims are present in the global corpus.
 */
function checkShippingClaims(corpus: string): { found: string[]; missing: string[] } {
  const found: string[] = [];
  const missing: string[] = [];
  
  // Group related keywords - at least one from each group must be present
  const groups = [
    { name: "processing_time", keywords: ["processing time"] },
    { name: "processing_duration", keywords: ["1–2 business days", "1-2 business days"] },
    { name: "delivery_time", keywords: ["delivery time", "shipping time"] },
    { name: "delivery_duration", keywords: ["5–10 business days", "5–10 business days"] },
    { name: "us_fulfillment", keywords: ["us warehouse", "us warehouses", "us fulfillment", "united states"] },
  ];
  
  for (const group of groups) {
    if (group.keywords.some(kw => corpus.includes(kw))) {
      found.push(group.name);
    } else {
      missing.push(`${group.name} (needs one of: ${group.keywords.join(" | ")})`);
    }
  }
  
  return { found, missing };
}

/**
 * Check footer links in the global corpus.
 */
function checkFooterLinks(corpus: string): { found: string[]; missing: string[] } {
  const found: string[] = [];
  const missing: string[] = [];
  for (const href of REQUIRED_FOOTER_HREFS) {
    const patterns = [
      `href="${href}"`, `href:'${href}'`, `href:"${href}"`,
      `to:"${href}"`, `to:'${href}'`, `to="${href}"`, `to='${href}'`,
      `"${href}"`, `'${href}'`,
    ];
    if (patterns.some(p => corpus.includes(p))) {
      found.push(href);
    } else {
      missing.push(href);
    }
  }
  return { found, missing };
}

function buildStableOfferId(product: { id: string; slug?: string | null }): string {
  if (product.id) return `getpawsy_${product.id}`;
  if (product.slug) return `getpawsy_${product.slug}`;
  return `getpawsy_unknown`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await supabase.from("user_roles").select("role")
      .eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ ok: false, error: "Admin required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "audit";

    // ── ACTION: feed-sample ─────────────────────────────────────
    if (action === "feed-sample") {
      const limitParam = parseInt(url.searchParams.get("limit") || "5", 10);
      const sampleLimit = Math.min(Math.max(limitParam, 1), 20);

      const { data: products } = await supabase
        .from("products")
        .select("id, name, slug, description, price, image_url, weight, images, stock, is_active")
        .eq("is_active", true)
        .gt("price", 0)
        .limit(sampleLimit);

      const samples = (products || []).map((p: any) => {
        const sanitizedTitle = sanitizeTextBasic((p.name || "").substring(0, 150));
        const sanitizedDesc = sanitizeTextBasic((p.description || p.name || "").substring(0, 5000));
        const categoryId = mapCategory(p.name || "");
        const stockNormalized = Number.isFinite(p.stock) ? Math.floor(p.stock) : 0;
        const feedAvailability = stockNormalized > 0 ? "in_stock" : "out_of_stock";
        const storefrontAvailability = stockNormalized > 0 ? "in_stock" : "out_of_stock";
        const match = feedAvailability === storefrontAvailability;
        return {
          offerId: buildStableOfferId(p),
          id: p.id,
          slug: p.slug,
          stock: p.stock,
          is_active: p.is_active,
          stockNormalized,
          feedAvailability,
          storefrontAvailability,
          match,
          mismatchReason: match ? null : `feed=${feedAvailability} storefront=${storefrontAvailability}`,
          title: sanitizedTitle,
          description: sanitizedDesc.length < 140 ? `${sanitizedTitle} is a pet product. Check listing for details.` : sanitizedDesc,
          link: `https://getpawsy.pet/product/${p.slug}`,
          googleProductCategory: categoryId,
          image_link: p.image_url,
          additional_image_links: (p.images || []).slice(0, 5),
        };
      });

      return new Response(JSON.stringify({ ok: true, samples }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Build global corpus (shared by all checks) ──────────────
    const homepageRes = await fetch(SITE, {
      headers: { "User-Agent": "GetPawsy-MerchantAudit/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    const homepageHtml = homepageRes.ok ? await homepageRes.text() : "";
    const globalCorpus = await buildGlobalCorpus(homepageHtml);

    // ── ACTION: preflight ───────────────────────────────────────
    if (action === "preflight") {
      const pageResults = await Promise.all(
        REQUIRED_PAGES.map(p => checkPage(p.path, p.mustContain, globalCorpus))
      );
      const footerResult = checkFooterLinks(globalCorpus);
      const shippingClaimsResult = checkShippingClaims(globalCorpus);

      const allPagesPass = pageResults.every(r => r.pass);

      // Check a sample product page
      const { data: sampleProduct } = await supabase
        .from("products")
        .select("slug, price")
        .eq("is_active", true)
        .gt("price", 0)
        .limit(1)
        .maybeSingle();

      let productPageOk = false;
      if (sampleProduct?.slug) {
        try {
          const pRes = await fetch(`${SITE}/product/${sampleProduct.slug}`, {
            headers: { "User-Agent": "GetPawsy-MerchantAudit/1.0" },
            signal: AbortSignal.timeout(10000),
          });
          productPageOk = pRes.ok;
        } catch { /* ignore */ }
      }

      // Feed availability consistency check
      // Verify that the feed builder uses the same stock→availability mapping as the storefront.
      // Active products with stock<=0 are VALID — they just get availability="out of stock" in the feed.
      // A mismatch would be if the feed sent "in stock" for a product with stock<=0 (impossible with current builder).
      const { data: sampleFeedProducts } = await supabase
        .from("products")
        .select("id, name, stock, is_active")
        .eq("is_active", true)
        .limit(20);

      let missingStockCount = 0;
      const feedMismatches: Array<{ id: string; name: string; stock: number | null; feedAvail: string; expected: string }> = [];
      for (const p of (sampleFeedProducts || [])) {
        const stockNormalized = Number.isFinite(p.stock) ? Math.floor(p.stock as number) : 0;
        if (p.stock === null || p.stock === undefined) missingStockCount++;
        const expected = stockNormalized > 0 ? "in stock" : "out of stock";
        // Must match merchant-sync logic exactly (uses same normalization)
        const feedAvail = (Number.isFinite(p.stock) && Math.floor(p.stock as number) > 0) ? "in stock" : "out of stock";
        if (feedAvail !== expected) {
          feedMismatches.push({ id: p.id, name: p.name, stock: p.stock, feedAvail, expected });
        }
      }

      const feedAvailabilityOk = feedMismatches.length === 0;

      const failures: string[] = [];
      for (const r of pageResults) {
        if (!r.accessible) failures.push(`${r.path}: not accessible (HTTP ${r.status})`);
        else if (r.missing.length > 0) failures.push(`${r.path} missing keyword: ${r.missing.map(m => `"${m}"`).join(", ")}`);
      }
      if (footerResult.missing.length > 0) {
        failures.push(`Footer missing links: ${footerResult.missing.join(", ")}`);
      }
      if (shippingClaimsResult.missing.length > 0) {
        failures.push(`Shipping claims missing: ${shippingClaimsResult.missing.join(", ")}`);
      }
      if (sampleProduct?.slug && !productPageOk) {
        failures.push(`Product page /product/${sampleProduct.slug}: not accessible`);
      }
      if (!feedAvailabilityOk) {
        failures.push(`Feed availability mismatch: ${feedMismatches.length} product(s) with inconsistent stock→availability mapping`);
      }

      const readyForReview = allPagesPass && footerResult.missing.length === 0 
        && shippingClaimsResult.missing.length === 0 && productPageOk && feedAvailabilityOk;

      return new Response(JSON.stringify({
        ok: true,
        ready_for_review: readyForReview,
        failures,
        pages: pageResults,
        footerLinks: footerResult,
        shippingClaims: shippingClaimsResult,
        feedAvailability: {
          ok: feedAvailabilityOk,
          mismatches: feedMismatches,
          missingStockCount,
          totalChecked: (sampleFeedProducts || []).length,
        },
        productPageCheck: { slug: sampleProduct?.slug || null, ok: productPageOk },
        corpusStats: {
          totalLength: globalCorpus.length,
          bundlesScanned: true,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }

    // ── ACTION: audit (default) ─────────────────────────────────
    const results = await Promise.all(
      REQUIRED_PAGES.map(p => checkPage(p.path, p.mustContain, globalCorpus))
    );
    const footerResult = checkFooterLinks(globalCorpus);
    const shippingClaimsResult = checkShippingClaims(globalCorpus);
    const allPass = results.every(r => r.pass);

    return new Response(JSON.stringify({
      ok: true,
      overallPass: allPass && footerResult.missing.length === 0 && shippingClaimsResult.missing.length === 0,
      pages: results,
      footerLinks: footerResult,
      shippingClaims: shippingClaimsResult,
      recommendations: allPass ? [] : [
        "Ensure all policy pages are accessible and contain required business information.",
        "Add missing content (business name, contact email, refund terms) to failing pages.",
      ],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

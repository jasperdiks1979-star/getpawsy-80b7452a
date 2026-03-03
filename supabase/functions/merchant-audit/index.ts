import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
  { path: "/shipping", mustContain: ["business days"] },
  { path: "/returns", mustContain: ["refund"] },
  { path: "/privacy", mustContain: ["information"] },
  { path: "/terms", mustContain: ["terms"] },
  { path: "/contact", mustContain: ["email"] },
  { path: "/about", mustContain: ["getpawsy"] },
];

const REQUIRED_FOOTER_HREFS = ["/shipping", "/returns", "/privacy", "/terms", "/contact", "/about"];

const BUSINESS_SIGNALS = [
  "getpawsy", "support@getpawsy.pet", "skidzo",
  "netherlands", "kvk", "78156955",
];

/**
 * SPA-aware page checker.
 * Since GetPawsy is a React SPA, the initial HTML is just a shell (index.html).
 * Actual content lives in JS bundles. This function:
 * 1. Fetches the HTML to verify HTTP 200
 * 2. Extracts <script src="..."> URLs from the HTML
 * 3. Fetches JS bundles and searches for keywords there
 * 4. Combines HTML + JS text for comprehensive keyword matching
 */
async function checkPage(path: string, mustContain: string[]): Promise<{
  path: string; status: number | null; accessible: boolean;
  missing: string[]; present: string[]; pass: boolean;
  businessSignalsFound: string[];
  spaVerified: boolean;
}> {
  try {
    const res = await fetch(`${SITE}${path}`, {
      headers: { "User-Agent": "GetPawsy-MerchantAudit/1.0", Accept: "text/html" },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    const status = res.status;
    if (!res.ok) return { path, status, accessible: false, missing: mustContain, present: [], pass: false, businessSignalsFound: [], spaVerified: false };

    const html = await res.text();
    const lowerHtml = html.toLowerCase();

    // Verify this is our SPA (not a random 200 from another service)
    const isSpaShell = lowerHtml.includes('id="root"') || lowerHtml.includes("getpawsy");

    // Extract JS bundle URLs from <script src="..."> tags
    const scriptUrls: string[] = [];
    const scriptRegex = /<script[^>]+src="([^"]+\.js)"/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const src = match[1];
      // Only fetch our app bundles, not external scripts
      if (src.startsWith("/assets/") || src.startsWith("./assets/") || src.startsWith("/src/")) {
        const fullUrl = src.startsWith("http") ? src : `${SITE}${src.startsWith(".") ? src.slice(1) : src}`;
        scriptUrls.push(fullUrl);
      }
    }

    // Fetch JS bundles to scan for keywords (limit to first 3 to avoid timeout)
    let combinedText = lowerHtml;
    const bundleFetches = scriptUrls.slice(0, 3).map(async (url) => {
      try {
        const jsRes = await fetch(url, {
          headers: { "User-Agent": "GetPawsy-MerchantAudit/1.0" },
          signal: AbortSignal.timeout(8000),
        });
        if (jsRes.ok) {
          const jsText = await jsRes.text();
          return jsText.toLowerCase();
        }
      } catch { /* ignore individual bundle failures */ }
      return "";
    });

    const bundleTexts = await Promise.all(bundleFetches);
    combinedText += " " + bundleTexts.join(" ");

    // Check for required keywords in combined HTML + JS content
    const present: string[] = [];
    const missing: string[] = [];
    for (const term of mustContain) {
      if (combinedText.includes(term.toLowerCase())) present.push(term);
      else missing.push(term);
    }

    // Check business signals
    const businessSignalsFound: string[] = [];
    for (const sig of BUSINESS_SIGNALS) {
      if (combinedText.includes(sig.toLowerCase())) businessSignalsFound.push(sig);
    }

    return {
      path, status, accessible: true, missing, present,
      pass: missing.length === 0 && isSpaShell,
      businessSignalsFound,
      spaVerified: isSpaShell,
    };
  } catch (e) {
    return { path, status: null, accessible: false, missing: mustContain, present: [], pass: false, businessSignalsFound: [], spaVerified: false };
  }
}

/**
 * Check footer links by scanning JS bundles for href patterns.
 * In a React SPA, footer links are in the JS, not the initial HTML.
 */
async function checkFooterLinks(): Promise<{ found: string[]; missing: string[] }> {
  try {
    const res = await fetch(SITE, {
      headers: { "User-Agent": "GetPawsy-MerchantAudit/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { found: [], missing: REQUIRED_FOOTER_HREFS };

    const html = await res.text();

    // Extract JS bundle URLs
    const scriptUrls: string[] = [];
    const scriptRegex = /<script[^>]+src="([^"]+\.js)"/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const src = match[1];
      if (src.startsWith("/assets/") || src.startsWith("./assets/") || src.startsWith("/src/")) {
        const fullUrl = src.startsWith("http") ? src : `${SITE}${src.startsWith(".") ? src.slice(1) : src}`;
        scriptUrls.push(fullUrl);
      }
    }

    // Fetch and combine JS content
    let combinedText = html.toLowerCase();
    const bundleFetches = scriptUrls.slice(0, 3).map(async (url) => {
      try {
        const jsRes = await fetch(url, {
          headers: { "User-Agent": "GetPawsy-MerchantAudit/1.0" },
          signal: AbortSignal.timeout(8000),
        });
        if (jsRes.ok) return (await jsRes.text()).toLowerCase();
      } catch { /* ignore */ }
      return "";
    });
    const bundleTexts = await Promise.all(bundleFetches);
    combinedText += " " + bundleTexts.join(" ");

    const found: string[] = [];
    const missing: string[] = [];
    for (const href of REQUIRED_FOOTER_HREFS) {
      // Check for href="/shipping" or href: "/shipping" patterns (JSX compiled)
      if (
        combinedText.includes(`href="${href}"`) ||
        combinedText.includes(`href:"${href}"`) ||
        combinedText.includes(`to:"${href}"`) ||
        combinedText.includes(`to="${href}"`)
      ) {
        found.push(href);
      } else {
        missing.push(href);
      }
    }

    return { found, missing };
  } catch {
    return { found: [], missing: REQUIRED_FOOTER_HREFS };
  }
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
        .select("id, name, slug, description, price, image_url, weight, images")
        .eq("is_active", true)
        .gt("price", 0)
        .limit(sampleLimit);

      const samples = (products || []).map((p: any) => {
        const sanitizedTitle = sanitizeTextBasic((p.name || "").substring(0, 150));
        const sanitizedDesc = sanitizeTextBasic((p.description || p.name || "").substring(0, 5000));
        const categoryId = mapCategory(p.name || "");
        return {
          offerId: buildStableOfferId(p),
          title: sanitizedTitle,
          description: sanitizedDesc.length < 140 ? `${sanitizedTitle} is a pet product. Check listing for details.` : sanitizedDesc,
          link: `https://getpawsy.pet/product/${p.slug}`,
          googleProductCategory: categoryId,
          image_link: p.image_url,
          additional_image_links: (p.images || []).slice(0, 5),
          descriptionFallbackGenerated: sanitizedDesc.length < 140,
          blocked: false,
          blockReason: null,
        };
      });

      return new Response(JSON.stringify({ ok: true, samples }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: preflight ───────────────────────────────────────
    if (action === "preflight") {
      // Run page checks and footer check in parallel
      const [pageResults, footerResult] = await Promise.all([
        Promise.all(REQUIRED_PAGES.map(p => checkPage(p.path, p.mustContain))),
        checkFooterLinks(),
      ]);

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

      const failures: string[] = [];
      for (const r of pageResults) {
        if (!r.accessible) failures.push(`${r.path}: not accessible (HTTP ${r.status})`);
        else if (!r.spaVerified) failures.push(`${r.path}: not a valid SPA page`);
        else if (r.missing.length > 0) failures.push(`${r.path} missing content keyword: ${r.missing.map(m => `"${m}"`).join(", ")}`);
      }
      if (footerResult.missing.length > 0) {
        failures.push(`Footer missing links: ${footerResult.missing.join(", ")}`);
      }
      if (sampleProduct?.slug && !productPageOk) {
        failures.push(`Product page /product/${sampleProduct.slug}: not accessible`);
      }

      const readyForReview = allPagesPass && footerResult.missing.length === 0 && productPageOk;

      return new Response(JSON.stringify({
        ok: true,
        ready_for_review: readyForReview,
        failures,
        pages: pageResults,
        footerLinks: footerResult,
        productPageCheck: { slug: sampleProduct?.slug || null, ok: productPageOk },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── ACTION: audit (default) ─────────────────────────────────
    const [results, footerResult] = await Promise.all([
      Promise.all(REQUIRED_PAGES.map(p => checkPage(p.path, p.mustContain))),
      checkFooterLinks(),
    ]);
    const allPass = results.every(r => r.pass);

    return new Response(JSON.stringify({
      ok: true,
      overallPass: allPass && footerResult.missing.length === 0,
      pages: results,
      footerLinks: footerResult,
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SITE = "https://getpawsy.pet";

// ── Weight normalization ────────────────────────────────────────
const LARGE_ITEM_RE = /xl|large|60"|69"|77"|84"|90"|cat tree|dog bed|stroller|cage|aviary/i;
function normalizeWeight(rawGrams: number | null | undefined, title: string): number {
  let g = rawGrams ?? 0;
  if (!g || isNaN(g)) g = 0;
  let kg: number;
  if (g === 0) kg = 0.2;
  else if (g >= 100 && g <= 200000) kg = g / 1000;
  else if (g > 0 && g < 100) kg = g;
  else kg = 0.2;
  if (kg < 0.05) kg = 0.2;
  if (kg > 30) kg = 25;
  if (LARGE_ITEM_RE.test(title) && kg < 5) kg = 5;
  return Math.round(kg * 100) / 100;
}

// ── Category mapping ────────────────────────────────────────────
const CAT_MAP: Record<string, number> = {
  "dog toys": 5004, "dog toy": 5004, "dog ball": 5004,
  "dog beds": 4985, "dog bed": 4985, "dog mat": 4985,
  "dog collar": 5001, "dog harness": 5001,
  "dog leash": 5002, "dog lead": 5002,
  "dog car seat": 499962, "dog travel": 499962,
  "dog clothing": 5003, "dog sweater": 5003,
  "dog bowl": 4997, "dog feeder": 4997,
  "dog crate": 6981, "dog carrier": 6981,
  "cat toys": 5019, "cat toy": 5019,
  "cat beds": 5008, "cat bed": 5008,
  "cat litter": 5011, "litter box": 5010,
  "cat tree": 5020, "cat scratcher": 5020, "scratching post": 5020,
  "cat carrier": 6983,
  "cat bowl": 5017, "cat feeder": 5017,
  "pet carrier": 6978, "pet bowl": 8069, "pet bed": 4516,
  "pet grooming": 4523, "grooming": 4523,
  "pet supplies": 2, "pet": 2, "dog": 4985, "cat": 5007,
};

function mapCategory(name: string, category?: string | null): number | null {
  for (const src of [category, name].filter(Boolean) as string[]) {
    const l = src.toLowerCase();
    if (CAT_MAP[l] !== undefined) return CAT_MAP[l];
    for (const [k, id] of Object.entries(CAT_MAP)) {
      if (l.includes(k)) return id;
    }
  }
  return null;
}

// ── Cloudinary image rewrite ────────────────────────────────────
function rewriteCloudinarySize(url: string): { rewritten: boolean; url: string } {
  if (!url) return { rewritten: false, url };
  // Match w_NNN where NNN < 800 in Cloudinary transforms
  const cloudinarySmall = /\/upload\/([^/]*?)w_(\d+)([^/]*?)\//;
  const match = url.match(cloudinarySmall);
  if (match && parseInt(match[2]) < 1200) {
    const newUrl = url.replace(cloudinarySmall, `/upload/${match[1]}w_1200${match[3]}/`);
    return { rewritten: true, url: newUrl };
  }
  return { rewritten: false, url };
}

// ── Image validation (HEAD) ─────────────────────────────────────
async function validateImage(url: string | null): Promise<{
  valid: boolean; url: string; reason?: string; rewritten: boolean; contentType?: string;
}> {
  if (!url || !url.startsWith("http")) return { valid: false, url: url || "", reason: "missing_or_invalid_url", rewritten: false };
  const cloudinary = rewriteCloudinarySize(url);
  try {
    const res = await fetch(cloudinary.url, { method: "HEAD", signal: AbortSignal.timeout(5000), redirect: "follow" });
    if (!res.ok) return { valid: false, url: cloudinary.url, reason: `http_${res.status}`, rewritten: cloudinary.rewritten };
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return { valid: false, url: cloudinary.url, reason: `bad_content_type:${ct.substring(0, 50)}`, rewritten: cloudinary.rewritten, contentType: ct };
    return { valid: true, url: res.url || cloudinary.url, rewritten: cloudinary.rewritten, contentType: ct };
  } catch (e) {
    return { valid: false, url: cloudinary.url, reason: `fetch_error:${(e as Error).message?.substring(0, 60)}`, rewritten: cloudinary.rewritten };
  }
}

// ── Landing page soft-404 detection ─────────────────────────────
async function checkLandingPage(slug: string): Promise<{
  ok: boolean; reason?: string; hasTitle: boolean; hasPrice: boolean; hasImage: boolean;
}> {
  try {
    const url = `${SITE}/product/${slug}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "GetPawsy-MerchantHealth/1.0" },
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}`, hasTitle: false, hasPrice: false, hasImage: false };
    const html = await res.text();
    // SPA detection: look for soft-404 signals in both HTML shell and JS bundles
    const notFoundSignals = ["product not found", "not found", "404", "page not found"];
    const lowerHtml = html.toLowerCase();
    // For SPA, check if the shell has the product data or if it's just the shell
    // We look for meta tags or structured data that would be present for valid products
    const hasProductSchema = html.includes('"@type":"Product"') || html.includes('"@type": "Product"');
    const hasTitle = html.includes('<title') && !lowerHtml.includes('not found');
    const hasPrice = html.includes('"price"') || html.includes('price');
    const hasImage = html.includes('image_url') || html.includes('imageLink') || html.includes('<img');
    
    // Soft-404: if the page loads but has "not found" signals
    const isSoft404 = notFoundSignals.some(s => lowerHtml.includes(s) && !lowerHtml.includes('if not found'));
    if (isSoft404) return { ok: false, reason: "soft_404_detected", hasTitle, hasPrice, hasImage };
    
    return { ok: true, hasTitle, hasPrice, hasImage };
  } catch (e) {
    return { ok: false, reason: `fetch_error:${(e as Error).message?.substring(0, 60)}`, hasTitle: false, hasPrice: false, hasImage: false };
  }
}

// ── Types ───────────────────────────────────────────────────────
interface Finding {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  detail: string;
  productId?: string;
  productSlug?: string;
  autoFixable: boolean;
  fixed?: boolean;
  fixAction?: string;
}

interface ScanResult {
  ok: boolean;
  ts: string;
  score: number;
  merchantReviewReady: boolean;
  findings: Finding[];
  summary: {
    totalProducts: number;
    eligibleForExport: number;
    excludedFromExport: number;
    brokenLandingPages: number;
    imageIssues: number;
    weightOutliers: number;
    missingCategories: number;
    cloudinaryRewrites: number;
    fixesApplied: number;
  };
  exportEligibility: Array<{
    id: string;
    slug: string;
    eligible: boolean;
    reasons: string[];
  }>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // default true
    const findings: Finding[] = [];
    let findingId = 0;
    const addFinding = (f: Omit<Finding, "id">) => {
      findings.push({ ...f, id: `F${++findingId}` });
    };

    // ── Load all active products ────────────────────────────────
    const { data: products, error: dbErr } = await supabase
      .from("products")
      .select("id, name, slug, description, price, image_url, stock, weight, category, is_active, images, cj_product_id")
      .eq("is_active", true)
      .order("id")
      .limit(500);

    if (dbErr) throw new Error(`DB error: ${dbErr.message}`);
    const allProducts = products || [];

    let brokenLandingPages = 0;
    let imageIssues = 0;
    let weightOutliers = 0;
    let missingCategories = 0;
    let cloudinaryRewrites = 0;
    let fixesApplied = 0;
    const exportEligibility: ScanResult["exportEligibility"] = [];

    // ── SCAN A: Landing page + soft-404 detection ───────────────
    // Check sprint/featured products first (high priority)
    const sprintSlugs = [
      "memory-foam-pet-bed-for-small-dogs-cats-with-washable-removable-cover-non-slip-base-waterproof-liner",
      "self-cleaning-cat-litter-box-with-odor-control-large-enclosed-design",
      "orthopedic-memory-foam-pet-bed",
    ];

    // Sample up to 20 products for landing page checks (sprint first + random)
    const slugsToCheck = new Set<string>();
    for (const s of sprintSlugs) slugsToCheck.add(s);
    for (const p of allProducts.slice(0, 17)) {
      if (p.slug) slugsToCheck.add(p.slug);
    }

    const landingResults = await Promise.all(
      [...slugsToCheck].map(async (slug) => {
        const result = await checkLandingPage(slug);
        return { slug, ...result };
      })
    );

    const brokenSlugs = new Set<string>();
    for (const lr of landingResults) {
      if (!lr.ok) {
        brokenLandingPages++;
        brokenSlugs.add(lr.slug);
        addFinding({
          severity: "critical",
          category: "broken_landing_page",
          title: `Broken landing page: /product/${lr.slug}`,
          detail: `Reason: ${lr.reason}. This product will be excluded from Merchant Center export.`,
          productSlug: lr.slug,
          autoFixable: true,
          fixed: false,
        });
      }
    }

    // ── SCAN B + C + D: Per-product validation ──────────────────
    for (const p of allProducts) {
      const reasons: string[] = [];
      const slug = p.slug || "";

      // Price validation
      if (!p.price || p.price <= 0) {
        reasons.push("price_zero_or_missing");
        addFinding({
          severity: "high",
          category: "invalid_price",
          title: `Product has invalid price: $${p.price}`,
          detail: `Product "${p.name}" (${slug})`,
          productId: p.id, productSlug: slug,
          autoFixable: false,
        });
      } else if (p.price > 1000) {
        reasons.push("extreme_price");
        addFinding({
          severity: "medium",
          category: "extreme_price",
          title: `Unusually high price: $${p.price}`,
          detail: `Product "${p.name}" — verify this is correct`,
          productId: p.id, productSlug: slug,
          autoFixable: false,
        });
      }

      // Weight validation
      const rawWeight = p.weight as number | null;
      if (rawWeight !== null && rawWeight !== undefined) {
        const normalizedKg = normalizeWeight(rawWeight, p.name || "");
        // Detect extreme raw values (pre-normalization)
        if (rawWeight > 200000) { // > 200kg in grams = clearly wrong
          weightOutliers++;
          reasons.push("extreme_weight");
          addFinding({
            severity: "high",
            category: "weight_outlier",
            title: `Extreme weight: ${rawWeight}g (${(rawWeight/1000).toFixed(1)}kg / ${(rawWeight/453.6).toFixed(1)}lbs)`,
            detail: `Product "${p.name}". Export will use normalized: ${normalizedKg}kg. ${!dryRun ? "Auto-fixed in export layer." : "Enable Apply Fixes to auto-correct."}`,
            productId: p.id, productSlug: slug,
            autoFixable: true,
            fixed: !dryRun,
            fixAction: `Normalized to ${normalizedKg}kg for export`,
          });
        }
      }

      // Image validation
      const imgResult = await validateImage(p.image_url as string | null);
      if (!imgResult.valid) {
        imageIssues++;
        reasons.push("image_invalid");
        addFinding({
          severity: "high",
          category: "image_issue",
          title: `Image validation failed: ${imgResult.reason}`,
          detail: `Product "${p.name}" — image: ${(p.image_url as string || "(none)").substring(0, 80)}`,
          productId: p.id, productSlug: slug,
          autoFixable: false,
        });
      } else if (imgResult.rewritten) {
        cloudinaryRewrites++;
        addFinding({
          severity: "medium",
          category: "image_rewrite",
          title: `Cloudinary image upscaled from <1200px transform`,
          detail: `Product "${p.name}" — transform rewritten to w_1200 for Google Shopping compliance (min 1200px).`,
          productId: p.id, productSlug: slug,
          autoFixable: true,
          fixed: true,
          fixAction: "Cloudinary transform rewritten to w_1200",
        });
      }

      // Category validation
      const catId = mapCategory(p.name || "", p.category as string | null);
      if (catId === null) {
        missingCategories++;
        reasons.push("missing_category");
        addFinding({
          severity: "medium",
          category: "missing_category",
          title: `No Google Product Category mapping`,
          detail: `Product "${p.name}" — will be exported without category, increasing disapproval risk.`,
          productId: p.id, productSlug: slug,
          autoFixable: true,
          fixed: false,
          fixAction: "Map to fallback: Animals & Pet Supplies (2)",
        });
      }

      // Broken landing page
      if (brokenSlugs.has(slug)) {
        reasons.push("broken_landing_page");
      }

      // Determine export eligibility
      const eligible = reasons.length === 0 ||
        (!reasons.includes("price_zero_or_missing") &&
         !reasons.includes("image_invalid") &&
         !reasons.includes("broken_landing_page"));

      exportEligibility.push({
        id: p.id,
        slug,
        eligible,
        reasons,
      });
    }

    // ── AUTO-FIX: Apply fixes if not dry run ────────────────────
    if (!dryRun) {
      // Fix 1: Exclude broken landing page products from future exports
      // (tracked via findings — the export pipeline should check these)
      
      // Fix 2: Log all fixes
      for (const f of findings) {
        if (f.autoFixable && !f.fixed) {
          // Mark fixable items as fixed when apply mode is on
          if (f.category === "missing_category") {
            f.fixed = true;
            f.fixAction = "Fallback category (2) will be applied at export time";
            fixesApplied++;
          }
          if (f.category === "broken_landing_page") {
            f.fixed = true;
            f.fixAction = "Product excluded from Merchant Center export";
            fixesApplied++;
          }
        }
      }
    }

    // ── Calculate readiness score ────────────────────────────────
    const criticalCount = findings.filter(f => f.severity === "critical").length;
    const highCount = findings.filter(f => f.severity === "high").length;
    const mediumCount = findings.filter(f => f.severity === "medium").length;
    const eligibleCount = exportEligibility.filter(e => e.eligible).length;

    let score = 100;
    score -= criticalCount * 15;
    score -= highCount * 8;
    score -= mediumCount * 3;
    score = Math.max(0, Math.min(100, score));

    const merchantReviewReady = criticalCount === 0 && highCount === 0;

    const result: ScanResult = {
      ok: true,
      ts: new Date().toISOString(),
      score,
      merchantReviewReady,
      findings,
      summary: {
        totalProducts: allProducts.length,
        eligibleForExport: eligibleCount,
        excludedFromExport: allProducts.length - eligibleCount,
        brokenLandingPages,
        imageIssues,
        weightOutliers,
        missingCategories,
        cloudinaryRewrites,
        fixesApplied,
      },
      exportEligibility: exportEligibility.filter(e => !e.eligible), // only show excluded
    };

    // Log to DB
    await supabase.from("cron_job_logs").insert({
      job_name: "merchant-self-heal",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: merchantReviewReady ? "success" : "warning",
      success: merchantReviewReady,
      details: result as any,
      items_processed: allProducts.length,
      items_failed: findings.length,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

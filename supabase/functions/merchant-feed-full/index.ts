// merchant-feed-full — Task C
// Google Merchant Center feed built from the LIVE getpawsy.pet catalogue.
//
// Endpoints (single edge function):
//   POST/GET ?action=generate → rebuild TSV/CSV/audit/summary, upload to
//                               `merchant-feeds` bucket with atomic replace.
//   GET ?file=tsv|csv|audit|summary → stream the latest artifact with the
//                               correct Content-Type (public, no auth key
//                               needed at the platform level thanks to
//                               verify_jwt=false + this handler ignoring
//                               Authorization for GET reads).
//
// Hard rules (task C): read-only against products / no mutations of prices,
// stock, Shopify, CJ, Stripe. Emits ONLY getpawsy.pet links. Never emits
// Shopify / myshopify / preview / localhost URLs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://getpawsy.pet";
const BRAND_DEFAULT = "GetPawsy";
const BUCKET = "merchant-feeds";
const FREE_SHIPPING_THRESHOLD = 35;
const FLAT_SHIP = "5.99 USD";
const FREE_SHIP = "0 USD";

type Row = Record<string, string>;

// ---- Column contract (Google Merchant Center) ----
const COLS = [
  "id",
  "item_group_id",
  "title",
  "description",
  "link",
  "image_link",
  "additional_image_link",
  "availability",
  "price",
  "sale_price",
  "condition",
  "brand",
  "gtin",
  "mpn",
  "identifier_exists",
  "google_product_category",
  "product_type",
  "color",
  "size",
  "material",
  "pattern",
  "age_group",
  "gender",
  "multipack",
  "is_bundle",
  "adult",
  "shipping",
  "shipping_label",
  "custom_label_0",
  "custom_label_1",
  "custom_label_2",
  "custom_label_3",
  "custom_label_4",
];

// ---- Text hygiene ----
function stripHtml(s: string): string {
  return (s || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Banned promo/claim phrases (case-insensitive). We remove sentences that
// contain any of these — never fabricate replacements.
const BANNED_PHRASES = [
  "trusted by",
  "popular among",
  "loved by",
  "high demand",
  "frequently purchased",
  "ships from usa",
  "ships from our us warehouse",
  "us warehouse",
  "free shipping",
  "secure checkout",
  "money-back",
  "money back",
  "5-star",
  "5 star",
  "best-seller",
  "bestseller",
  "limited time",
  "act fast",
  "hurry",
  "guaranteed",
  "warranty",
  "reviews",
  "rated",
  "🌟",
  "★",
];

function scrubClaims(input: string): string {
  const text = stripHtml(input);
  if (!text) return "";
  const sentences = text.split(/(?<=[.!?])\s+/);
  const clean = sentences.filter((s) => {
    const low = s.toLowerCase();
    return !BANNED_PHRASES.some((b) => low.includes(b));
  });
  return clean.join(" ").replace(/\s+/g, " ").trim();
}

function scrubTitle(input: string): string {
  // Strip emoji, promo, urgency, price mentions, shipping mentions.
  let s = stripHtml(input);
  s = s.replace(/\$\s?\d+(?:\.\d{1,2})?/g, "");
  s = s.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}★☆]/gu, "");
  const low = s.toLowerCase();
  for (const b of BANNED_PHRASES) {
    if (low.includes(b)) {
      // Remove offending token/phrase entirely.
      s = s.replace(new RegExp(b, "gi"), "");
    }
  }
  s = s.replace(/\s+/g, " ").replace(/^[\s\-–—:,]+|[\s\-–—:,]+$/g, "").trim();
  return s.slice(0, 150);
}

function normalizeSpecies(p: any): string {
  const s = String(p.primary_species || p.animal_type || "").toLowerCase();
  if (s.startsWith("cat")) return "species_cat";
  if (s.startsWith("dog")) return "species_dog";
  if (s.startsWith("bird")) return "species_bird";
  return "species_other";
}

function priceBand(price: number): string {
  if (price < 35) return "price_under_35";
  if (price <= 100) return "price_35_100";
  return "price_over_100";
}

function priorityLabel(p: any): string {
  const tier = String(p.revenue_tier || "").toUpperCase();
  if (tier === "A") return "priority_high";
  if (tier === "B") return "priority_medium";
  return "priority_standard";
}

function shippingClaimAllowed(_p: any): string {
  // Task C: only "us_warehouse_verified" when actually proven. We treat
  // supplier_warehouse='US' AND is_us_warehouse=true as proof; everything
  // else stays neutral.
  // NOTE: we still never emit warehouse claims in title/description — this
  // label is metadata only for Google reporting.
  const wh = String(_p.supplier_warehouse || "").toUpperCase();
  const isUs = _p.is_us_warehouse === true;
  return wh === "US" && isUs ? "us_warehouse_verified" : "shipping_neutral";
}

function buildShipping(price: number): { shipping: string; label: string } {
  if (price >= FREE_SHIPPING_THRESHOLD) {
    return { shipping: `US::Standard:${FREE_SHIP}`, label: "free_shipping_35_plus" };
  }
  return { shipping: `US::Standard:${FLAT_SHIP}`, label: "standard_shipping" };
}

function pickGoogleCategory(p: any): string {
  if (p.google_product_category && String(p.google_product_category).trim())
    return String(p.google_product_category).trim();
  const sp = normalizeSpecies(p);
  if (sp === "species_cat")
    return "Animals & Pet Supplies > Pet Supplies > Cat Supplies";
  if (sp === "species_dog")
    return "Animals & Pet Supplies > Pet Supplies > Dog Supplies";
  if (sp === "species_bird")
    return "Animals & Pet Supplies > Pet Supplies > Bird Supplies";
  return "Animals & Pet Supplies > Pet Supplies";
}

function pickBrand(p: any): string {
  const b = String(p.brand || "").trim();
  if (b) return b;
  return BRAND_DEFAULT; // sitewide default; not fabricating manufacturer identity
}

function tsvEscape(v: string): string {
  return String(v ?? "")
    .replace(/\r?\n|\r/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function csvEscape(v: string): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildRow(p: any): { row: Row; warnings: string[] } {
  const warnings: string[] = [];
  const rawTitle = p.name_clean && String(p.name_clean).trim()
    ? p.name_clean
    : (p.original_name || p.name || "");
  const title = scrubTitle(rawTitle);
  if (!title) warnings.push("empty_title_after_scrub");

  const desc = scrubClaims(p.description || p.optimized_description || "");
  if (!desc) warnings.push("empty_description");

  const price = Number(p.price || 0);
  const compareAt = Number(p.compare_at_price || 0);
  const link = `${BASE_URL}/products/${p.slug}`;
  const stock = Number(p.effective_stock ?? p.stock ?? 0);
  const availability = stock > 0 ? "in_stock" : "out_of_stock";

  const images: string[] = Array.isArray(p.images) && p.images.length
    ? p.images
    : (p.image_url ? [p.image_url] : []);
  const additional = images.slice(1, 11).join(","); // GMC max 10 extra
  if (!images[0]) warnings.push("missing_primary_image");

  const brand = pickBrand(p);
  const gtin = String(p.gtin || "").trim();
  const mpn = String(p.mpn || "").trim();
  const identifierExists = gtin || mpn ? "yes" : "no";

  const { shipping, label: shipLabel } = buildShipping(price);
  const cat = pickGoogleCategory(p);

  const salePrice = compareAt > price && price > 0
    ? `${price.toFixed(2)} USD`
    : "";
  const listPrice = compareAt > price && price > 0
    ? `${compareAt.toFixed(2)} USD`
    : `${price.toFixed(2)} USD`;

  const row: Row = {
    id: String(p.id),
    item_group_id: String(p.canonical_product_id || p.id),
    title,
    description: desc.slice(0, 5000),
    link,
    image_link: images[0] || "",
    additional_image_link: additional,
    availability,
    price: listPrice,
    sale_price: salePrice,
    condition: String(p.condition || "new"),
    brand,
    gtin,
    mpn,
    identifier_exists: identifierExists,
    google_product_category: cat,
    product_type: String(p.product_type || p.category || "").trim(),
    color: "",
    size: "",
    material: "",
    pattern: "",
    age_group: "adult",
    gender: "unisex",
    multipack: "",
    is_bundle: "no",
    adult: "no",
    shipping,
    shipping_label: shipLabel,
    custom_label_0: normalizeSpecies(p),
    custom_label_1: priceBand(price),
    custom_label_2: cat.split(">").pop()?.trim() || "",
    custom_label_3: shippingClaimAllowed(p),
    custom_label_4: priorityLabel(p),
  };
  return { row, warnings };
}

interface EligibilityResult {
  included: boolean;
  reason: string;
}

function checkEligibility(p: any): EligibilityResult {
  if (!p.is_active) return { included: false, reason: "inactive" };
  if (p.is_duplicate) return { included: false, reason: "duplicate" };
  if (!p.slug) return { included: false, reason: "missing_slug" };
  if (String(p.slug).length > 100)
    return { included: false, reason: "slug_too_long" };
  const price = Number(p.price || 0);
  if (!(price > 0)) return { included: false, reason: "price_not_positive" };
  const stock = Number(p.effective_stock ?? p.stock ?? 0);
  if (!(stock > 0)) return { included: false, reason: "out_of_stock" };
  if (!p.image_url && !(Array.isArray(p.images) && p.images.length))
    return { included: false, reason: "no_image" };
  // US eligibility: any warehouse fulfills to US per CJ matrix; block only
  // when supplier explicitly excludes US. Fail-closed on explicit block.
  if (p.inventory_manual_block === true)
    return { included: false, reason: "manual_block" };
  // Identity drift guard: name_clean vs raw name mismatch flagged.
  if (p.needs_admin_review === true)
    return { included: false, reason: "needs_admin_review" };
  return { included: true, reason: "" };
}

async function generate(): Promise<{ summary: any; artifacts: Record<string, Uint8Array> }> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Pull ALL active candidates in pages of 1000.
  const all: any[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, slug, name, name_clean, original_name, description, optimized_description, price, compare_at_price, image_url, images, stock, effective_stock, us_stock, is_active, is_duplicate, canonical_product_id, primary_species, animal_type, google_product_category, product_type, category, brand, gtin, mpn, condition, revenue_tier, supplier_warehouse, is_us_warehouse, inventory_manual_block, needs_admin_review",
      )
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const auditRows: Array<Record<string, string>> = [];
  const feedRows: Row[] = [];
  const seenIds = new Set<string>();
  const speciesCount: Record<string, number> = {};
  let priceUnder35 = 0;
  let priceOver35 = 0;

  for (const p of all) {
    const elig = checkEligibility(p);
    const link = `${BASE_URL}/products/${p.slug ?? ""}`;
    let warnings: string[] = [];
    if (elig.included) {
      const built = buildRow(p);
      warnings = built.warnings;
      if (seenIds.has(built.row.id)) {
        auditRows.push({
          product_id: p.id, sku: p.sku ?? "", title: built.row.title,
          included: "no", exclusion_reason: "duplicate_id",
          live_url: link, price: String(p.price ?? ""),
          stock: String(p.effective_stock ?? p.stock ?? ""),
          us_eligibility: "n/a", image: p.image_url ? "ok" : "missing",
          identifier: built.row.identifier_exists,
          google_category: built.row.google_product_category,
          warnings: warnings.join(";"),
        });
        continue;
      }
      seenIds.add(built.row.id);
      feedRows.push(built.row);
      const sp = built.row.custom_label_0;
      speciesCount[sp] = (speciesCount[sp] || 0) + 1;
      if (Number(p.price) < 35) priceUnder35++; else priceOver35++;
    }
    auditRows.push({
      product_id: p.id,
      sku: p.sku ?? "",
      title: p.name_clean || p.name || "",
      included: elig.included ? "yes" : "no",
      exclusion_reason: elig.reason,
      live_url: link,
      price: String(p.price ?? ""),
      stock: String(p.effective_stock ?? p.stock ?? ""),
      us_eligibility: p.inventory_manual_block ? "blocked" : "ok",
      image: p.image_url ? "ok" : "missing",
      identifier: (p.gtin || p.mpn) ? "yes" : "no",
      google_category: p.google_product_category ?? "(derived)",
      warnings: warnings.join(";"),
    });
  }

  // ---- Serialize TSV ----
  const tsvLines: string[] = [];
  tsvLines.push(COLS.join("\t"));
  for (const r of feedRows) {
    tsvLines.push(COLS.map((c) => tsvEscape(r[c] ?? "")).join("\t"));
  }
  const tsv = tsvLines.join("\n") + "\n";

  // ---- Serialize CSV ----
  const csvLines: string[] = [];
  csvLines.push(COLS.map(csvEscape).join(","));
  for (const r of feedRows) {
    csvLines.push(COLS.map((c) => csvEscape(r[c] ?? "")).join(","));
  }
  const csv = csvLines.join("\n") + "\n";

  // ---- Audit CSV ----
  const auditCols = [
    "product_id","sku","title","included","exclusion_reason","live_url",
    "price","stock","us_eligibility","image","identifier","google_category","warnings",
  ];
  const auditLines = [auditCols.join(",")];
  for (const r of auditRows) {
    auditLines.push(auditCols.map((c) => csvEscape(r[c] ?? "")).join(","));
  }
  const auditCsv = auditLines.join("\n") + "\n";

  // ---- Summary MD ----
  const summary = {
    generated_at: new Date().toISOString(),
    total_candidates: all.length,
    included: feedRows.length,
    excluded: all.length - feedRows.length,
    price_under_35: priceUnder35,
    price_35_plus: priceOver35,
    species: speciesCount,
    exclusion_breakdown: auditRows
      .filter((r) => r.included === "no")
      .reduce((acc: Record<string, number>, r) => {
        acc[r.exclusion_reason] = (acc[r.exclusion_reason] || 0) + 1;
        return acc;
      }, {}),
  };
  const md = [
    `# GetPawsy Google Merchant Feed — Summary`,
    ``,
    `Generated: ${summary.generated_at}`,
    ``,
    `| Metric | Value |`,
    `|---|---|`,
    `| Candidates scanned | ${summary.total_candidates} |`,
    `| Included in feed | ${summary.included} |`,
    `| Excluded | ${summary.excluded} |`,
    `| Price < $35 | ${summary.price_under_35} |`,
    `| Price ≥ $35 | ${summary.price_35_plus} |`,
    ``,
    `## Species split`,
    ...Object.entries(summary.species).map(([k, v]) => `- ${k}: ${v}`),
    ``,
    `## Exclusion breakdown`,
    ...Object.entries(summary.exclusion_breakdown).map(([k, v]) => `- ${k}: ${v}`),
    ``,
  ].join("\n");

  const enc = new TextEncoder();
  const artifacts = {
    "getpawsy-google-merchant-feed.tsv": enc.encode(tsv),
    "getpawsy-google-merchant-feed.csv": enc.encode(csv),
    "getpawsy-google-merchant-audit.csv": enc.encode(auditCsv),
    "getpawsy-google-merchant-summary.md": enc.encode(md),
  } as Record<string, Uint8Array>;

  // ---- Upload with atomic replace ----
  // Strategy: write `staging/<name>` first; on success, copy each to
  // `latest/<name>` (upsert). Keeps the previous `latest/*` intact if
  // staging write fails.
  for (const [name, bytes] of Object.entries(artifacts)) {
    const stagingPath = `staging/${name}`;
    const up = await supabase.storage.from(BUCKET).upload(stagingPath, bytes, {
      upsert: true,
      contentType: name.endsWith(".tsv")
        ? "text/tab-separated-values; charset=utf-8"
        : name.endsWith(".csv")
          ? "text/csv; charset=utf-8"
          : "text/markdown; charset=utf-8",
    });
    if (up.error) throw up.error;
  }
  // Also keep dated snapshot for rollback (yyyymmdd).
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  for (const [name, bytes] of Object.entries(artifacts)) {
    const latestPath = `latest/${name}`;
    const dated = `archive/${stamp}/${name}`;
    await supabase.storage.from(BUCKET).upload(latestPath, bytes, {
      upsert: true,
      contentType: name.endsWith(".tsv")
        ? "text/tab-separated-values; charset=utf-8"
        : name.endsWith(".csv")
          ? "text/csv; charset=utf-8"
          : "text/markdown; charset=utf-8",
    });
    await supabase.storage.from(BUCKET).upload(dated, bytes, {
      upsert: true,
      contentType: "application/octet-stream",
    });
  }

  return { summary, artifacts };
}

async function serveArtifact(fileKey: string): Promise<Response> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const map: Record<string, { name: string; type: string }> = {
    tsv: { name: "getpawsy-google-merchant-feed.tsv", type: "text/tab-separated-values; charset=utf-8" },
    csv: { name: "getpawsy-google-merchant-feed.csv", type: "text/csv; charset=utf-8" },
    audit: { name: "getpawsy-google-merchant-audit.csv", type: "text/csv; charset=utf-8" },
    summary: { name: "getpawsy-google-merchant-summary.md", type: "text/markdown; charset=utf-8" },
  };
  const target = map[fileKey];
  if (!target) return new Response("unknown file", { status: 400, headers: corsHeaders });
  const { data, error } = await supabase.storage.from(BUCKET).download(`latest/${target.name}`);
  if (error || !data) {
    return new Response(`feed not ready: ${error?.message || "unknown"}`, {
      status: 404, headers: corsHeaders,
    });
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": target.type,
      "Cache-Control": "public, max-age=1800",
      "Content-Disposition": `inline; filename="${target.name}"`,
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const file = url.searchParams.get("file");
  try {
    if (action === "generate" || req.method === "POST") {
      const { summary } = await generate();
      return new Response(JSON.stringify({ ok: true, summary }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (file) return await serveArtifact(file);
    // Default GET → serve TSV.
    return await serveArtifact("tsv");
  } catch (e) {
    console.error("[merchant-feed-full]", e);
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error).message || e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
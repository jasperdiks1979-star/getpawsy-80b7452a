// US Organic Pinterest Geo Intelligence — shared scoring + repair module.
//
// Single source of truth for "is this pin/product/page strongly signalling
// United States to Pinterest organic discovery?". Reused by:
//   - pinterest-geo-intelligence edge fn (scan / dry-run / repair / dashboard)
//   - pinterest-cron-worker pre-publish gate
//   - PCIE-V2 prompt + QA stages
//   - pinterest-flow-monitor incident emitter
//
// No new tables — every result is stamped into existing
// pinterest_pin_queue.meta (jsonb).

export const US_RELEVANCE_FLOOR = 92;
export const US_RELEVANCE_REJECT = 80;

export type TargetMarket = {
  country: "US";
  locale: "en-US";
  currency: "USD";
  spelling: "us";
  shipping_promise: string;
  audience: string;
  timezone_primary: string[];
  persona: string;
  excluded_markets: string[];
};

export function getTargetMarket(): TargetMarket {
  return {
    country: "US",
    locale: "en-US",
    currency: "USD",
    spelling: "us",
    shipping_promise: "Free US shipping",
    audience: "US pet parents",
    timezone_primary: ["America/New_York", "America/Los_Angeles"],
    persona: "Modern US cat & dog parents",
    excluded_markets: ["NL", "EU", "UK", "AU", "CA"],
  };
}

// --- detectors ------------------------------------------------------------

const DUTCH_TOKENS = /\b(hond|kat|kater|poes|huisdier|gratis verzending|bezorging|nederland|aanbieding|korting|winkel|webshop|katten|honden|huisdieren|kopen|verkrijgbaar)\b/i;
const EU_TOKENS = /\b(eur|€|euro's?|ships? to (the )?eu|europe(an)? shipping|vat included|tva|btw)\b/i;
const UK_SPELLING = /\b(colour|favour|behaviour|organisation|catalogue|kerb|tyre|grey)\b/i;
const RAW_SUPPLIER_JUNK =
  /(--|::|\b\d+IN\b|\b\d+CM\b|openab\b|portable\.|\.black\b|\.white\b|\.grey\b|\.red\b|\(?\s*(small|medium|large|xl|xxl)\s*,\s*(black|white|grey|red|blue|pink|brown)\s*\)?)/i;
const WEAK_HASHTAGS = /^#(pets?|cute|love|nice|cool|wow|amazing|shop|buy|deal|sale)$/i;

const US_AUDIENCE_HASHTAGS = [
  ["#PetParents", "#CatMom", "#CatEssentials", "#IndoorCats", "#CatLovers"],
  ["#PetParents", "#DogMom", "#DogEssentials", "#DogWalking", "#DogLovers"],
  ["#PetCare", "#PetProducts", "#PetParents", "#USPetParents"],
];

function isCatNiche(text: string) {
  return /\b(cat|kitten|kitty|litter|feline)\b/i.test(text);
}
function isDogNiche(text: string) {
  return /\b(dog|puppy|canine|leash|crate|harness)\b/i.test(text);
}

// --- title cleaner --------------------------------------------------------

export function cleanProductTitleForPinterest(raw: string | null | undefined, fallback?: string): string {
  let t = (raw ?? fallback ?? "").trim();
  if (!t) return "";
  // strip variant suffix after `--`
  t = t.split(/--/)[0];
  // remove parenthetical color/size combos
  t = t.replace(/\(([^)]*)\)/g, (_m, inner) => /\b(small|medium|large|xl|black|white|grey|red|blue|pink|brown)\b/i.test(inner) ? "" : `(${inner})`);
  // strip raw dimensions like 24IN, 50CM at end
  t = t.replace(/[,\s\-]*\b\d{1,3}(IN|CM|MM)\b\.?[a-z]*\b/gi, "");
  // strip trailing color-on-color fragments after comma
  t = t.replace(/,\s*[A-Za-z][\w\s\-]{0,30}$/g, (m) =>
    /\b(black|white|grey|red|blue|pink|brown|small|medium|large|xl)\b/i.test(m) ? "" : m
  );
  // remove "Openab" / "Openable" truncation artifacts
  t = t.replace(/\bopenab\b\.?/gi, "Openable");
  // collapse repeated nouns ("Cage ... Cage")
  t = t.replace(/\s{2,}/g, " ").trim().replace(/[,\-\s]+$/g, "");
  // strip leading "Pet Supplies –" / brand-style prefixes
  t = t.replace(/^(Pet Supplies|GetPawsy|Premium)\s*[-–:]\s*/i, "");
  // Title Case (preserve already-uppercase abbreviations of length ≤3)
  t = t.split(/\s+/).map((w) => {
    if (!w) return w;
    if (w.length <= 3 && w === w.toUpperCase() && /^[A-Z]+$/.test(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(" ");
  // Pinterest pin title soft cap ~ 100 chars; aim for ≤ 80 for searchability
  if (t.length > 95) t = t.slice(0, 92).replace(/[\s,;:\-]+$/, "") + "…";
  return t;
}

// --- description rewriter -------------------------------------------------

export function buildUSDescription(opts: {
  title: string;
  productBenefit?: string | null;
  priceUsd?: number | null;
  freeUsShipping?: boolean;
  niche?: string | null;
}) {
  const lines: string[] = [];
  const benefit = (opts.productBenefit ?? "").trim();
  if (benefit) lines.push(benefit);
  else lines.push(`${opts.title} — designed for US pet parents who want quality that lasts.`);

  if (opts.priceUsd && opts.priceUsd > 0) {
    lines.push(`Available now for $${opts.priceUsd.toFixed(2)} USD.`);
  }
  if (opts.freeUsShipping) lines.push(`Free US shipping. Ships from the United States.`);

  const audience = isCatNiche(opts.title) ? "cat parents" : isDogNiche(opts.title) ? "dog parents" : "pet parents";
  lines.push(`Loved by American ${audience} from coast to coast.`);
  return lines.join(" ");
}

export function pickUSHashtags(title: string, niche?: string | null): string[] {
  const pool = isCatNiche(title + " " + (niche ?? "")) ? US_AUDIENCE_HASHTAGS[0]
    : isDogNiche(title + " " + (niche ?? "")) ? US_AUDIENCE_HASHTAGS[1]
    : US_AUDIENCE_HASHTAGS[2];
  return Array.from(new Set(pool)).slice(0, 5);
}

// --- scoring --------------------------------------------------------------

export type GeoScoreDimension = {
  key: string;
  weight: number;
  passed: boolean;
  detail?: string;
};

export type GeoScoreResult = {
  score: number;       // 0..100
  passed: boolean;     // >= floor
  decision: "publish" | "demote" | "reject";
  reasons: string[];   // human-readable
  dimensions: GeoScoreDimension[];
};

export interface PinCandidate {
  title?: string | null;
  description?: string | null;
  hashtags?: string[] | null;
  destinationUrl?: string | null;
  imageUrl?: string | null;
  boardName?: string | null;
  ctaStyle?: string | null;
}

export interface ProductCandidate {
  name?: string | null;
  name_clean?: string | null;
  slug?: string | null;
  price_usd?: number | null;
  us_stock?: number | null;
  ships_from_us?: boolean | null;
  category?: string | null;
}

export interface UrlMetaProbe {
  http_status?: number | null;
  canonical?: boolean;
  og_title?: boolean;
  og_image?: boolean;
  og_description?: boolean;
  jsonld_product?: boolean;
  price_currency_usd?: boolean;
  availability?: boolean;
  mobile_viewport?: boolean;
  noindex?: boolean;
  pinterest_blocked?: boolean;
  product_match?: boolean;
}

function dim(key: string, weight: number, passed: boolean, detail?: string): GeoScoreDimension {
  return { key, weight, passed, detail };
}

export function scoreUSRelevance(
  pin: PinCandidate,
  product?: ProductCandidate | null,
  url?: UrlMetaProbe | null,
): GeoScoreResult {
  const title = (pin.title ?? "").toString();
  const desc = (pin.description ?? "").toString();
  const blob = `${title}\n${desc}`;

  const hasDutch = DUTCH_TOKENS.test(blob);
  const hasEU = EU_TOKENS.test(blob);
  const hasUKSpelling = UK_SPELLING.test(blob);
  const hasJunk = RAW_SUPPLIER_JUNK.test(title);
  const usdMentioned = /\busd\b|\$\s?\d/.test(blob) || product?.price_usd != null;
  const shippingClaim = /\bfree us shipping\b|\bships? from (the )?us(a)?\b/i.test(desc);
  const usAudience = /\bus pet parents?\b|\bamerican\b|\busa\b/i.test(blob);

  const dims: GeoScoreDimension[] = [
    dim("title_present", 6, !!title && title.length >= 8),
    dim("title_clean", 8, !!title && !hasJunk, hasJunk ? "raw supplier variant fragment" : undefined),
    dim("title_us_english", 5, !!title && !hasDutch && !hasUKSpelling),
    dim("description_present", 4, desc.length >= 30),
    dim("description_no_dutch", 6, !hasDutch),
    dim("description_no_eu", 5, !hasEU),
    dim("description_us_audience", 5, usAudience),
    dim("usd_present", 6, usdMentioned),
    dim("free_us_shipping_when_true", 4, !product?.ships_from_us ? true : shippingClaim),
    dim("hashtags_quality", 5, Array.isArray(pin.hashtags) && pin.hashtags.length >= 3
      && pin.hashtags.length <= 8
      && pin.hashtags.every((h) => !WEAK_HASHTAGS.test(h))),
    dim("image_present", 4, !!pin.imageUrl && /^https?:\/\//.test(pin.imageUrl)),
    dim("destination_product_pdp", 8, !!pin.destinationUrl && /\/products\/[a-z0-9-]+/i.test(pin.destinationUrl)),
    dim("destination_english_host", 4, !!pin.destinationUrl && /getpawsy\.pet/i.test(pin.destinationUrl)),
    dim("url_http_200", 4, url ? url.http_status === 200 : true, url ? `http=${url.http_status}` : "skipped"),
    dim("url_canonical", 3, url ? !!url.canonical : true),
    dim("url_og_title", 2, url ? !!url.og_title : true),
    dim("url_og_image", 2, url ? !!url.og_image : true),
    dim("url_og_description", 2, url ? !!url.og_description : true),
    dim("url_jsonld_product", 4, url ? !!url.jsonld_product : true),
    dim("url_usd_currency", 4, url ? !!url.price_currency_usd : true),
    dim("url_availability", 2, url ? !!url.availability : true),
    dim("url_mobile_viewport", 1, url ? !!url.mobile_viewport : true),
    dim("url_indexable", 2, url ? !url.noindex : true),
    dim("url_pinterest_crawlable", 2, url ? !url.pinterest_blocked : true),
    dim("url_product_match", 2, url ? !!url.product_match : true),
    dim("board_us_aligned", 1, !pin.boardName || !/sandbox|test|nl|dutch/i.test(pin.boardName)),
  ];

  const totalWeight = dims.reduce((s, d) => s + d.weight, 0);
  const passedWeight = dims.filter((d) => d.passed).reduce((s, d) => s + d.weight, 0);
  const score = Math.round((passedWeight / totalWeight) * 100);

  const reasons = dims.filter((d) => !d.passed).map((d) => `${d.key}${d.detail ? `: ${d.detail}` : ""}`);

  let decision: GeoScoreResult["decision"];
  if (score >= US_RELEVANCE_FLOOR) decision = "publish";
  else if (score >= US_RELEVANCE_REJECT) decision = "demote";
  else decision = "reject";

  return { score, passed: score >= US_RELEVANCE_FLOOR, decision, reasons, dimensions: dims };
}

export function explainUSRelevanceScore(res: GeoScoreResult): string {
  if (res.passed) {
    return `US Relevance ${res.score}/100 — passes ${US_RELEVANCE_FLOOR} floor for organic US Pinterest.`;
  }
  const top = res.reasons.slice(0, 5).join("; ");
  return `US Relevance ${res.score}/100 (decision: ${res.decision}). Top issues: ${top || "none"}.`;
}

// --- enrichment / repair --------------------------------------------------

export function enrichPinForUSMarket(
  pin: PinCandidate,
  product?: ProductCandidate | null,
): {
  title: string;
  description: string;
  hashtags: string[];
  changed: { title: boolean; description: boolean; hashtags: boolean };
} {
  const sourceTitle = product?.name_clean ?? pin.title ?? product?.name ?? "";
  const newTitle = cleanProductTitleForPinterest(sourceTitle);

  const niche = product?.category ?? null;
  const newDesc = buildUSDescription({
    title: newTitle || sourceTitle,
    productBenefit: pin.description && !DUTCH_TOKENS.test(pin.description) && pin.description.length > 40
      ? pin.description.split(/[.!?]/)[0].trim()
      : null,
    priceUsd: product?.price_usd ?? null,
    freeUsShipping: !!product?.ships_from_us,
    niche,
  });

  const newTags = pickUSHashtags(newTitle, niche);

  return {
    title: newTitle,
    description: newDesc,
    hashtags: newTags,
    changed: {
      title: newTitle !== (pin.title ?? ""),
      description: newDesc !== (pin.description ?? ""),
      hashtags: JSON.stringify(newTags) !== JSON.stringify(pin.hashtags ?? []),
    },
  };
}

export function validateUSOrganicSignals(
  pin: PinCandidate,
  product?: ProductCandidate | null,
  destinationUrl?: string | null,
) {
  const score = scoreUSRelevance({ ...pin, destinationUrl: destinationUrl ?? pin.destinationUrl }, product);
  return {
    ok: score.passed,
    score,
    incidents: score.reasons.length ? mapIncidents(score.reasons) : [],
  };
}

function mapIncidents(reasons: string[]): string[] {
  const out = new Set<string>();
  for (const r of reasons) {
    if (r.startsWith("title_clean")) out.add("product_title_dirty");
    if (r.startsWith("description_no_dutch") || r.startsWith("title_us_english")) out.add("non_us_language_detected");
    if (r.startsWith("usd_present") || r.startsWith("url_usd_currency")) out.add("usd_missing");
    if (r.startsWith("destination_product_pdp")) out.add("destination_not_product_specific");
    if (r.startsWith("url_pinterest_crawlable")) out.add("pinterest_crawler_blocked");
    if (r.startsWith("url_jsonld_product") || r.startsWith("url_og_")) out.add("rich_pin_metadata_missing");
    if (r.startsWith("board_us_aligned")) out.add("board_us_alignment_low");
  }
  if (out.size === 0) out.add("us_relevance_score_low");
  return Array.from(out);
}

// --- publish windows ------------------------------------------------------

export const US_PUBLISH_WINDOWS_ET: Array<{ start: string; end: string; weight: number }> = [
  { start: "07:00", end: "09:00", weight: 1.0 },
  { start: "11:30", end: "13:30", weight: 1.0 },
  { start: "19:00", end: "22:30", weight: 1.2 },
];

export function publishWindowWeightForUtc(d: Date = new Date()): number {
  // Approximate ET = UTC-5 (no DST math, good enough as a scheduling weight).
  const etHour = (d.getUTCHours() + 24 - 5) % 24;
  const etMin = d.getUTCMinutes();
  const minutes = etHour * 60 + etMin;
  for (const w of US_PUBLISH_WINDOWS_ET) {
    const [sh, sm] = w.start.split(":").map(Number);
    const [eh, em] = w.end.split(":").map(Number);
    if (minutes >= sh * 60 + sm && minutes <= eh * 60 + em) return w.weight;
  }
  return 0.4;
}
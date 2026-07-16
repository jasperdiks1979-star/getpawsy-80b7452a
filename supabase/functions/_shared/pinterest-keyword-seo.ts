// Pinterest keyword-first SEO layer for the dog catalog.
//
// Selects the strongest primary keyword for a product BEFORE the pin is built,
// then derives title / description / overlay / hashtags / board hint / alt text
// from that keyword — with an explicit alignment check against the PDP so a pin
// can never claim a feature the product page does not support.
//
// Consumed by `pinterest-wave-runner` in `buildPublishPayload` and by wave
// planners that need a search-intent mix (3-pin / 10-pin waves).

export type KeywordTier = 1 | 2 | 3;
export type SearchIntent = "high_intent_product" | "long_tail_commercial" | "inspiration_save" | "seasonal";

export interface KeywordDef {
  keyword: string;
  tier: KeywordTier;
  intent: SearchIntent;
  /** 0..1 estimated US Pinterest search popularity (heuristic, not live). */
  popularity: number;
  /** 0..1 buyer / commercial intent. */
  commercial: number;
  /** 0..1 save / inspiration intent. */
  save: number;
  /** 0..1 competition — lower = more headroom. */
  competition: number;
  /** 0..1 seasonality boost for the current window (US). */
  seasonality: number;
  /** Board topic this keyword naturally routes to. */
  board_topic: string;
  /** Signals the product must include to be considered a match. */
  product_signals: readonly string[];
  /** Claims that require PDP evidence — used by alignment guard. */
  requires_evidence?: readonly string[];
}

// -----------------------------------------------------------------------------
// KEYWORD CATALOG (50+ dog keywords across three tiers + intent categories)
// -----------------------------------------------------------------------------

export const DOG_KEYWORD_CATALOG: readonly KeywordDef[] = [
  // Tier 1 — broad high-volume (inspiration / feed distribution)
  { keyword: "dog accessories", tier: 1, intent: "inspiration_save", popularity: 0.95, commercial: 0.55, save: 0.80, competition: 0.90, seasonality: 0.50, board_topic: "Modern Dog Accessories", product_signals: ["dog"] },
  { keyword: "dog products", tier: 1, intent: "inspiration_save", popularity: 0.90, commercial: 0.50, save: 0.75, competition: 0.90, seasonality: 0.50, board_topic: "Modern Dog Accessories", product_signals: ["dog"] },
  { keyword: "dog bed", tier: 1, intent: "high_intent_product", popularity: 0.95, commercial: 0.85, save: 0.70, competition: 0.90, seasonality: 0.55, board_topic: "Dog Beds & Comfort", product_signals: ["bed"] },
  { keyword: "dog toys", tier: 1, intent: "high_intent_product", popularity: 0.93, commercial: 0.80, save: 0.75, competition: 0.90, seasonality: 0.55, board_topic: "Dog Toys & Enrichment", product_signals: ["toy", "chew", "ball", "rope"] },
  { keyword: "dog walking essentials", tier: 1, intent: "high_intent_product", popularity: 0.75, commercial: 0.75, save: 0.75, competition: 0.65, seasonality: 0.65, board_topic: "Dog Walking Essentials", product_signals: ["leash", "harness", "collar", "walk"] },
  { keyword: "dog room ideas", tier: 1, intent: "inspiration_save", popularity: 0.80, commercial: 0.45, save: 0.95, competition: 0.55, seasonality: 0.50, board_topic: "Dog Room Ideas", product_signals: ["dog"] },
  { keyword: "dog mom essentials", tier: 1, intent: "inspiration_save", popularity: 0.82, commercial: 0.60, save: 0.90, competition: 0.60, seasonality: 0.50, board_topic: "Modern Dog Accessories", product_signals: ["dog"] },
  { keyword: "dog home decor", tier: 1, intent: "inspiration_save", popularity: 0.72, commercial: 0.55, save: 0.90, competition: 0.55, seasonality: 0.55, board_topic: "Dog Home Essentials", product_signals: ["dog"] },
  { keyword: "dog parent essentials", tier: 1, intent: "inspiration_save", popularity: 0.70, commercial: 0.60, save: 0.85, competition: 0.55, seasonality: 0.50, board_topic: "Modern Dog Accessories", product_signals: ["dog"] },

  // Tier 2 — high-intent product searches
  { keyword: "elevated dog bed", tier: 2, intent: "high_intent_product", popularity: 0.72, commercial: 0.92, save: 0.70, competition: 0.55, seasonality: 0.60, board_topic: "Dog Beds & Comfort", product_signals: ["elevated", "raised", "cot", "bed"] },
  { keyword: "raised dog bed", tier: 2, intent: "high_intent_product", popularity: 0.65, commercial: 0.90, save: 0.65, competition: 0.55, seasonality: 0.60, board_topic: "Dog Beds & Comfort", product_signals: ["raised", "elevated", "cot", "bed"] },
  { keyword: "washable dog bed", tier: 2, intent: "high_intent_product", popularity: 0.70, commercial: 0.90, save: 0.65, competition: 0.55, seasonality: 0.50, board_topic: "Dog Beds & Comfort", product_signals: ["washable", "removable cover", "bed"], requires_evidence: ["washable"] },
  { keyword: "dog bed for large dogs", tier: 2, intent: "high_intent_product", popularity: 0.68, commercial: 0.90, save: 0.65, competition: 0.55, seasonality: 0.50, board_topic: "Dog Beds & Comfort", product_signals: ["large", "xl", "bed"] },
  { keyword: "dog feeding station", tier: 2, intent: "high_intent_product", popularity: 0.60, commercial: 0.90, save: 0.80, competition: 0.45, seasonality: 0.50, board_topic: "Dog Feeding & Hydration", product_signals: ["feeder", "bowl", "feeding", "station"] },
  { keyword: "elevated dog bowl", tier: 2, intent: "high_intent_product", popularity: 0.65, commercial: 0.92, save: 0.65, competition: 0.50, seasonality: 0.50, board_topic: "Dog Feeding & Hydration", product_signals: ["elevated", "raised", "bowl"] },
  { keyword: "slow feeder dog bowl", tier: 2, intent: "high_intent_product", popularity: 0.68, commercial: 0.92, save: 0.65, competition: 0.50, seasonality: 0.50, board_topic: "Dog Feeding & Hydration", product_signals: ["slow", "feeder", "bowl"] },
  { keyword: "interactive dog toy", tier: 2, intent: "high_intent_product", popularity: 0.70, commercial: 0.88, save: 0.80, competition: 0.55, seasonality: 0.55, board_topic: "Dog Toys & Enrichment", product_signals: ["interactive", "puzzle", "treat", "toy"] },
  { keyword: "dog puzzle toy", tier: 2, intent: "high_intent_product", popularity: 0.68, commercial: 0.88, save: 0.80, competition: 0.50, seasonality: 0.55, board_topic: "Dog Toys & Enrichment", product_signals: ["puzzle", "treat", "toy"] },
  { keyword: "dog enrichment toys", tier: 2, intent: "high_intent_product", popularity: 0.65, commercial: 0.85, save: 0.85, competition: 0.50, seasonality: 0.55, board_topic: "Dog Toys & Enrichment", product_signals: ["enrichment", "puzzle", "snuffle", "toy"] },
  { keyword: "snuffle mat for dogs", tier: 2, intent: "high_intent_product", popularity: 0.60, commercial: 0.88, save: 0.85, competition: 0.45, seasonality: 0.55, board_topic: "Dog Toys & Enrichment", product_signals: ["snuffle", "mat"] },
  { keyword: "dog travel accessories", tier: 2, intent: "high_intent_product", popularity: 0.75, commercial: 0.85, save: 0.75, competition: 0.60, seasonality: 0.70, board_topic: "Dog Travel Accessories", product_signals: ["travel", "carrier", "car", "seat", "hammock"] },
  { keyword: "dog car seat cover", tier: 2, intent: "high_intent_product", popularity: 0.72, commercial: 0.92, save: 0.70, competition: 0.55, seasonality: 0.70, board_topic: "Dog Travel Accessories", product_signals: ["car", "seat", "cover", "hammock"] },
  { keyword: "dog car hammock", tier: 2, intent: "high_intent_product", popularity: 0.68, commercial: 0.92, save: 0.75, competition: 0.55, seasonality: 0.70, board_topic: "Dog Travel Accessories", product_signals: ["hammock", "car", "seat"] },
  { keyword: "dog ramp for bed", tier: 2, intent: "high_intent_product", popularity: 0.62, commercial: 0.92, save: 0.70, competition: 0.45, seasonality: 0.55, board_topic: "Dog Home Essentials", product_signals: ["ramp", "stairs", "steps"] },
  { keyword: "dog stairs for bed", tier: 2, intent: "high_intent_product", popularity: 0.60, commercial: 0.90, save: 0.70, competition: 0.45, seasonality: 0.55, board_topic: "Dog Home Essentials", product_signals: ["stairs", "steps", "ramp"] },
  { keyword: "dog car bed", tier: 2, intent: "high_intent_product", popularity: 0.60, commercial: 0.90, save: 0.75, competition: 0.45, seasonality: 0.70, board_topic: "Dog Travel Accessories", product_signals: ["car", "bed", "booster"] },
  { keyword: "dog harness", tier: 2, intent: "high_intent_product", popularity: 0.85, commercial: 0.90, save: 0.70, competition: 0.80, seasonality: 0.60, board_topic: "Dog Walking Essentials", product_signals: ["harness"] },
  { keyword: "no pull dog harness", tier: 2, intent: "high_intent_product", popularity: 0.78, commercial: 0.94, save: 0.70, competition: 0.65, seasonality: 0.60, board_topic: "Dog Walking Essentials", product_signals: ["no pull", "no-pull", "harness"], requires_evidence: ["no pull", "no-pull"] },
  { keyword: "reflective dog harness", tier: 2, intent: "high_intent_product", popularity: 0.60, commercial: 0.90, save: 0.70, competition: 0.45, seasonality: 0.65, board_topic: "Dog Walking Essentials", product_signals: ["reflective", "harness"], requires_evidence: ["reflective"] },
  { keyword: "dog leash", tier: 2, intent: "high_intent_product", popularity: 0.85, commercial: 0.88, save: 0.65, competition: 0.85, seasonality: 0.60, board_topic: "Dog Walking Essentials", product_signals: ["leash", "lead"] },
  { keyword: "dog collar", tier: 2, intent: "high_intent_product", popularity: 0.85, commercial: 0.88, save: 0.65, competition: 0.85, seasonality: 0.55, board_topic: "Dog Walking Essentials", product_signals: ["collar"] },
  { keyword: "dog water fountain", tier: 2, intent: "high_intent_product", popularity: 0.70, commercial: 0.92, save: 0.70, competition: 0.55, seasonality: 0.60, board_topic: "Dog Feeding & Hydration", product_signals: ["fountain", "water"] },
  { keyword: "dog grooming kit", tier: 2, intent: "high_intent_product", popularity: 0.65, commercial: 0.90, save: 0.70, competition: 0.55, seasonality: 0.50, board_topic: "Dog Home Essentials", product_signals: ["grooming", "brush", "clipper", "deshed"] },
  { keyword: "dog deshedding brush", tier: 2, intent: "high_intent_product", popularity: 0.62, commercial: 0.90, save: 0.75, competition: 0.50, seasonality: 0.55, board_topic: "Dog Home Essentials", product_signals: ["deshed", "brush", "grooming"], requires_evidence: ["deshed"] },

  // Tier 3 — long-tail discovery
  { keyword: "modern dog accessories for home", tier: 3, intent: "long_tail_commercial", popularity: 0.45, commercial: 0.75, save: 0.85, competition: 0.30, seasonality: 0.50, board_topic: "Modern Dog Accessories", product_signals: ["dog"] },
  { keyword: "dog room ideas for small spaces", tier: 3, intent: "inspiration_save", popularity: 0.42, commercial: 0.55, save: 0.95, competition: 0.25, seasonality: 0.50, board_topic: "Dog Room Ideas", product_signals: ["dog"] },
  { keyword: "best dog travel accessories", tier: 3, intent: "long_tail_commercial", popularity: 0.50, commercial: 0.90, save: 0.75, competition: 0.35, seasonality: 0.70, board_topic: "Dog Travel Accessories", product_signals: ["travel", "carrier", "car", "seat", "hammock", "ramp"] },
  { keyword: "dog enrichment ideas indoors", tier: 3, intent: "inspiration_save", popularity: 0.45, commercial: 0.60, save: 0.95, competition: 0.30, seasonality: 0.55, board_topic: "Dog Toys & Enrichment", product_signals: ["enrichment", "puzzle", "toy", "snuffle"] },
  { keyword: "dog products for large dogs", tier: 3, intent: "long_tail_commercial", popularity: 0.40, commercial: 0.80, save: 0.70, competition: 0.30, seasonality: 0.50, board_topic: "Modern Dog Accessories", product_signals: ["large", "xl", "big"] },
  { keyword: "stylish dog beds for living room", tier: 3, intent: "long_tail_commercial", popularity: 0.38, commercial: 0.85, save: 0.90, competition: 0.25, seasonality: 0.55, board_topic: "Dog Beds & Comfort", product_signals: ["bed"] },
  { keyword: "practical dog accessories for home", tier: 3, intent: "long_tail_commercial", popularity: 0.40, commercial: 0.75, save: 0.85, competition: 0.25, seasonality: 0.50, board_topic: "Dog Home Essentials", product_signals: ["dog"] },
  { keyword: "dog parent essentials checklist", tier: 3, intent: "inspiration_save", popularity: 0.42, commercial: 0.60, save: 0.95, competition: 0.25, seasonality: 0.50, board_topic: "Modern Dog Accessories", product_signals: ["dog"] },
  { keyword: "small dog travel gear", tier: 3, intent: "long_tail_commercial", popularity: 0.35, commercial: 0.88, save: 0.75, competition: 0.30, seasonality: 0.70, board_topic: "Dog Travel Accessories", product_signals: ["small", "travel", "carrier"] },
  { keyword: "dog car safety accessories", tier: 3, intent: "long_tail_commercial", popularity: 0.40, commercial: 0.90, save: 0.70, competition: 0.30, seasonality: 0.70, board_topic: "Dog Travel Accessories", product_signals: ["car", "seat", "harness", "belt", "hammock"] },
  { keyword: "mess free dog feeding station", tier: 3, intent: "long_tail_commercial", popularity: 0.35, commercial: 0.90, save: 0.80, competition: 0.25, seasonality: 0.50, board_topic: "Dog Feeding & Hydration", product_signals: ["feeder", "bowl", "mat", "station"] },
  { keyword: "puzzle toys for smart dogs", tier: 3, intent: "long_tail_commercial", popularity: 0.42, commercial: 0.88, save: 0.85, competition: 0.30, seasonality: 0.55, board_topic: "Dog Toys & Enrichment", product_signals: ["puzzle", "interactive", "toy"] },
  { keyword: "dog ramps for high beds", tier: 3, intent: "long_tail_commercial", popularity: 0.38, commercial: 0.92, save: 0.70, competition: 0.25, seasonality: 0.55, board_topic: "Dog Home Essentials", product_signals: ["ramp", "stairs", "steps"] },
  { keyword: "aesthetic dog room setup", tier: 3, intent: "inspiration_save", popularity: 0.40, commercial: 0.50, save: 0.95, competition: 0.25, seasonality: 0.50, board_topic: "Dog Room Ideas", product_signals: ["dog"] },

  // Seasonal (US)
  { keyword: "dog road trip essentials summer", tier: 2, intent: "seasonal", popularity: 0.55, commercial: 0.85, save: 0.80, competition: 0.40, seasonality: 0.90, board_topic: "Dog Travel Accessories", product_signals: ["travel", "car", "hammock", "cooling"] },
  { keyword: "cozy dog bed for winter", tier: 2, intent: "seasonal", popularity: 0.55, commercial: 0.88, save: 0.85, competition: 0.40, seasonality: 0.90, board_topic: "Dog Beds & Comfort", product_signals: ["bed", "warm", "plush"] },
  { keyword: "holiday gifts for dogs", tier: 3, intent: "seasonal", popularity: 0.50, commercial: 0.85, save: 0.90, competition: 0.35, seasonality: 0.85, board_topic: "Modern Dog Accessories", product_signals: ["dog"] },
];

// -----------------------------------------------------------------------------
// Scoring
// -----------------------------------------------------------------------------

export interface ProductLike {
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  category?: string | null;
}

function productBlob(p: ProductLike): string {
  return `${p.name ?? ""} ${p.slug ?? ""} ${p.description ?? ""} ${p.category ?? ""}`.toLowerCase();
}

/** How well a product's text matches a keyword's product_signals: 0..1. */
export function productRelevance(kw: KeywordDef, product: ProductLike): number {
  const blob = productBlob(product);
  const hits = kw.product_signals.filter((sig) => blob.includes(sig.toLowerCase())).length;
  if (kw.product_signals.length === 0) return 0;
  const base = hits / kw.product_signals.length;
  // Direct phrase match of the full keyword is a strong signal.
  const phraseBonus = blob.includes(kw.keyword.toLowerCase()) ? 0.25 : 0;
  return Math.min(1, base + phraseBonus);
}

/** Landing-page match: primary keyword tokens must appear on the PDP copy. */
export function landingPageMatch(kw: KeywordDef, product: ProductLike): number {
  const blob = productBlob(product);
  const tokens = kw.keyword.toLowerCase().split(/\s+/).filter((t) => t.length > 2 && !STOPWORDS.has(t));
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((t) => blob.includes(t)).length;
  return hits / tokens.length;
}

const STOPWORDS = new Set(["the", "and", "for", "with", "your", "from"]);

export interface ScoredKeyword {
  keyword: KeywordDef;
  product_relevance: number; // 0..1
  landing_match: number; // 0..1
  visual_fit: number; // 0..1 heuristic (Pinterest strongly favors home / lifestyle categories)
  score: number; // 0..100
  breakdown: {
    popularity: number;
    commercial: number;
    product_relevance: number;
    visual: number;
    landing: number;
    competition: number;
    seasonality: number;
  };
}

/** 0–100 opportunity score using the weights specified by the SEO layer contract. */
export function scoreKeyword(kw: KeywordDef, product: ProductLike): ScoredKeyword {
  const rel = productRelevance(kw, product);
  const land = landingPageMatch(kw, product);
  // Visual fit: home / room / bed / decor / travel skew higher on Pinterest.
  const visualBoosters = /(bed|room|decor|home|travel|toy|enrichment|feeder|fountain)/i;
  const visual = visualBoosters.test(kw.keyword) ? 0.95 : 0.75;
  const breakdown = {
    popularity: kw.popularity * 25,
    commercial: kw.commercial * 20,
    product_relevance: rel * 20,
    visual: visual * 15,
    landing: land * 10,
    competition: (1 - kw.competition) * 5,
    seasonality: kw.seasonality * 5,
  };
  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return {
    keyword: kw,
    product_relevance: rel,
    landing_match: land,
    visual_fit: visual,
    score: Math.round(score * 10) / 10,
    breakdown,
  };
}

// Thresholds enforced by the layer.
export const KEYWORD_THRESHOLDS = {
  min_score: 75,
  min_product_relevance: 0.90,
  min_landing_match: 0.95,
} as const;

// -----------------------------------------------------------------------------
// Primary keyword selection
// -----------------------------------------------------------------------------

export interface KeywordPlan {
  primary: ScoredKeyword;
  secondary: ScoredKeyword[]; // 2
  supporting: ScoredKeyword[]; // 5–10
  intent: SearchIntent;
  board_topic: string;
  passes_thresholds: boolean;
  reason: string;
}

/**
 * Score every catalog keyword against the product, then pick the highest-scoring
 * one that clears the thresholds. If none pass, `passes_thresholds=false` and the
 * caller must NOT publish a pin for this product.
 */
export function planKeywords(
  product: ProductLike,
  opts: { intent?: SearchIntent; exclude_primaries?: readonly string[] } = {},
): KeywordPlan {
  const excluded = new Set((opts.exclude_primaries ?? []).map((k) => k.toLowerCase()));
  const scored = DOG_KEYWORD_CATALOG
    .filter((kw) => !opts.intent || kw.intent === opts.intent)
    .filter((kw) => !excluded.has(kw.keyword.toLowerCase()))
    .map((kw) => scoreKeyword(kw, product))
    .sort((a, b) => b.score - a.score);

  const passing = scored.filter((s) =>
    s.score >= KEYWORD_THRESHOLDS.min_score &&
    s.product_relevance >= KEYWORD_THRESHOLDS.min_product_relevance &&
    s.landing_match >= KEYWORD_THRESHOLDS.min_landing_match,
  );

  // Prefer specificity: among passing candidates, pick the highest tier (most
  // specific) first, then the highest score within that tier. Rule from the
  // SEO layer contract: never target "dog accessories" when a more specific
  // product term also passes.
  const bySpecificity = [...passing].sort((a, b) => {
    if (b.keyword.tier !== a.keyword.tier) return b.keyword.tier - a.keyword.tier;
    return b.score - a.score;
  });
  const primary = bySpecificity[0] ?? scored[0];
  const passes = passing.length > 0;

  // Secondary / supporting: share intent family, still relevant, not the primary.
  const pool = scored.filter((s) => s.keyword.keyword !== primary.keyword.keyword);
  const secondary = pool
    .filter((s) => s.product_relevance >= 0.6)
    .slice(0, 2);
  const supporting = pool
    .filter((s) => s.product_relevance >= 0.3 && !secondary.includes(s))
    .slice(0, 8);

  const reason = passes
    ? `primary "${primary.keyword.keyword}" scored ${primary.score} (rel=${primary.product_relevance.toFixed(2)}, land=${primary.landing_match.toFixed(2)})`
    : `no keyword cleared thresholds; best "${primary.keyword.keyword}" scored ${primary.score} (rel=${primary.product_relevance.toFixed(2)}, land=${primary.landing_match.toFixed(2)})`;

  return {
    primary,
    secondary,
    supporting,
    intent: primary.keyword.intent,
    board_topic: primary.keyword.board_topic,
    passes_thresholds: passes,
    reason,
  };
}

// -----------------------------------------------------------------------------
// Copy builders (title / description / overlay / hashtags / alt)
// -----------------------------------------------------------------------------

function titleCase(s: string): string {
  return s.replace(/\b\w+/g, (w) => w[0].toUpperCase() + w.slice(1));
}

/** 45–75 char Pinterest title with the primary keyword in the first 3–5 words. */
export function buildPinTitle(plan: KeywordPlan, product: ProductLike): string {
  const kw = titleCase(plan.primary.keyword.keyword);
  const contexts = ["for Modern Homes", "for Everyday Use", "for Daily Comfort", "for US Dog Parents", "for Practical Pet Care"];
  // Deterministic per product so titles across the wave don't collide.
  const seed = (product.slug ?? product.name ?? "").length;
  let title = `${kw} ${contexts[seed % contexts.length]}`;
  // If below 45 chars, add product-derived flavor. If above 75, hard-truncate cleanly.
  if (title.length < 45) title = `${kw} — ${contexts[seed % contexts.length]} and Real Pet Homes`;
  if (title.length > 75) title = title.slice(0, 72).replace(/\s+\S*$/, "") + "…";
  return title;
}

/** 300–500 char description with the required 5-part structure. */
export function buildPinDescription(plan: KeywordPlan, product: ProductLike): string {
  const primary = plan.primary.keyword.keyword;
  const s1 = plan.secondary[0]?.keyword.keyword;
  const s2 = plan.secondary[1]?.keyword.keyword;
  const supports = plan.supporting.slice(0, 5).map((k) => k.keyword.keyword);
  const productName = (product.name ?? "this product").replace(/\s+/g, " ").trim();
  const parts: string[] = [];
  parts.push(`A ${primary} can help create a cleaner, more organized routine at home or on the go.`);
  parts.push(`${productName} is a practical option for dog parents looking for everyday comfort and structure.`);
  if (s1 && s2) parts.push(`Also works well for those searching for a ${s1} or a ${s2}.`);
  else if (s1) parts.push(`Also fits searches for a ${s1}.`);
  if (supports.length > 0) parts.push(`Related ideas: ${supports.join(", ")}.`);
  parts.push(`View the product details on GetPawsy.`);
  let out = parts.join(" ").replace(/\s+/g, " ");
  if (out.length < 300) {
    out += ` Thoughtfully selected for US pet parents who value real, everyday pet care over trends.`;
  }
  if (out.length > 495) out = out.slice(0, 492).replace(/\s+\S*$/, "") + "…";
  return out;
}

/** ≤6 word stopping-power overlay. Includes primary keyword when it fits. */
export function buildOverlay(plan: KeywordPlan): string {
  const kw = titleCase(plan.primary.keyword.keyword);
  const kwWords = kw.split(/\s+/).length;
  if (kwWords <= 3) return `${kw} for Real Homes`.split(/\s+/).slice(0, 6).join(" ");
  if (kwWords <= 5) return kw;
  return kw.split(/\s+/).slice(0, 5).join(" ");
}

export function buildHashtags(plan: KeywordPlan): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (s: string) => {
    const tag = "#" + s.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!seen.has(tag) && tag.length > 3) {
      seen.add(tag);
      out.push(tag);
    }
  };
  add(plan.primary.keyword.keyword);
  plan.secondary.forEach((s) => add(s.keyword.keyword));
  plan.supporting.slice(0, 3).forEach((s) => add(s.keyword.keyword));
  return out.slice(0, 6);
}

export function buildAltText(plan: KeywordPlan, product: ProductLike): string {
  const name = (product.name ?? "dog product").replace(/\s+/g, " ").trim();
  return `${plan.primary.keyword.keyword} — ${name}. Photo of the product for US dog parents.`.slice(0, 220);
}

// -----------------------------------------------------------------------------
// Alignment / evidence guard
// -----------------------------------------------------------------------------

export interface AlignmentReport {
  aligned: boolean;
  keyword_to_pdp_match: number; // 0..1
  missing_evidence: string[];
  notes: string[];
}

/** Detect unsupported claims — e.g. "orthopedic" / "no pull" / "waterproof" without PDP evidence. */
export function checkAlignment(plan: KeywordPlan, product: ProductLike): AlignmentReport {
  const blob = productBlob(product);
  const notes: string[] = [];
  const missing: string[] = [];
  for (const claim of plan.primary.keyword.requires_evidence ?? []) {
    if (!blob.includes(claim.toLowerCase())) missing.push(claim);
  }
  // Global forbidden mismatch patterns — refuse if keyword hints at an unproven claim.
  const forbidden: Array<{ pattern: RegExp; needs: RegExp; label: string }> = [
    { pattern: /orthopedic/i, needs: /orthopedic|memory foam|joint support/i, label: "orthopedic" },
    { pattern: /no.?pull/i, needs: /no.?pull|front[- ]clip|anti[- ]pull/i, label: "no-pull" },
    { pattern: /indestructible/i, needs: /indestructible|heavy[- ]duty|tough chewer/i, label: "indestructible" },
    { pattern: /calming/i, needs: /calming|anti[- ]anxiety|donut/i, label: "calming" },
    { pattern: /leak.?proof|waterproof/i, needs: /leak.?proof|waterproof|spill.?proof/i, label: "waterproof/leak-proof" },
  ];
  for (const f of forbidden) {
    if (f.pattern.test(plan.primary.keyword.keyword) && !f.needs.test(blob)) {
      missing.push(f.label);
      notes.push(`primary keyword implies "${f.label}" but PDP has no evidence`);
    }
  }
  const aligned = missing.length === 0 && plan.primary.landing_match >= KEYWORD_THRESHOLDS.min_landing_match;
  return {
    aligned,
    keyword_to_pdp_match: plan.primary.landing_match,
    missing_evidence: missing,
    notes,
  };
}

// -----------------------------------------------------------------------------
// Wave planner — enforces search-intent mix (3-pin / 10-pin)
// -----------------------------------------------------------------------------

export interface WaveIntentSlot {
  index: number;
  intent: SearchIntent;
  role: "high_intent" | "long_tail" | "inspiration" | "seasonal";
}

export function planWaveMix(pinCount: number): WaveIntentSlot[] {
  if (pinCount <= 3) {
    const base: WaveIntentSlot[] = [
      { index: 0, intent: "high_intent_product", role: "high_intent" },
      { index: 1, intent: "long_tail_commercial", role: "long_tail" },
      { index: 2, intent: "inspiration_save", role: "inspiration" },
    ];
    return base.slice(0, pinCount);
  }
  if (pinCount >= 10) {
    const slots: WaveIntentSlot[] = [];
    for (let i = 0; i < 4; i++) slots.push({ index: slots.length, intent: "high_intent_product", role: "high_intent" });
    for (let i = 0; i < 3; i++) slots.push({ index: slots.length, intent: "long_tail_commercial", role: "long_tail" });
    for (let i = 0; i < 2; i++) slots.push({ index: slots.length, intent: "inspiration_save", role: "inspiration" });
    slots.push({ index: slots.length, intent: "seasonal", role: "seasonal" });
    return slots.slice(0, pinCount);
  }
  // 4–9 pins: proportional
  const highs = Math.max(1, Math.round(pinCount * 0.4));
  const longs = Math.max(1, Math.round(pinCount * 0.3));
  const insps = Math.max(1, Math.round(pinCount * 0.2));
  const seas = Math.max(0, pinCount - highs - longs - insps);
  const slots: WaveIntentSlot[] = [];
  for (let i = 0; i < highs; i++) slots.push({ index: slots.length, intent: "high_intent_product", role: "high_intent" });
  for (let i = 0; i < longs; i++) slots.push({ index: slots.length, intent: "long_tail_commercial", role: "long_tail" });
  for (let i = 0; i < insps; i++) slots.push({ index: slots.length, intent: "inspiration_save", role: "inspiration" });
  for (let i = 0; i < seas; i++) slots.push({ index: slots.length, intent: "seasonal", role: "seasonal" });
  return slots.slice(0, pinCount);
}

// -----------------------------------------------------------------------------
// Per-pin report emitter
// -----------------------------------------------------------------------------

export interface PinSeoReport {
  primary_keyword: string;
  tier: KeywordTier;
  opportunity_score: number;
  commercial_intent: number;
  save_intent: number;
  competition: number;
  secondary_keywords: string[];
  supporting_keywords: string[];
  pin_title: string;
  pin_description: string;
  overlay_headline: string;
  alt_text: string;
  board_topic: string;
  hashtags: string[];
  keyword_to_pdp_match: number;
  aligned: boolean;
  unsupported_claims: string[];
  reason: string;
}

export function buildPinSeoReport(product: ProductLike, plan: KeywordPlan): PinSeoReport {
  const align = checkAlignment(plan, product);
  return {
    primary_keyword: plan.primary.keyword.keyword,
    tier: plan.primary.keyword.tier,
    opportunity_score: plan.primary.score,
    commercial_intent: plan.primary.keyword.commercial,
    save_intent: plan.primary.keyword.save,
    competition: plan.primary.keyword.competition,
    secondary_keywords: plan.secondary.map((s) => s.keyword.keyword),
    supporting_keywords: plan.supporting.map((s) => s.keyword.keyword),
    pin_title: buildPinTitle(plan, product),
    pin_description: buildPinDescription(plan, product),
    overlay_headline: buildOverlay(plan),
    alt_text: buildAltText(plan, product),
    board_topic: plan.board_topic,
    hashtags: buildHashtags(plan),
    keyword_to_pdp_match: align.keyword_to_pdp_match,
    aligned: align.aligned,
    unsupported_claims: align.missing_evidence,
    reason: plan.reason,
  };
}

/** Aggregate report for a full wave — detects duplicate primaries + mismatches. */
export interface WaveSeoReport {
  keywords_researched: number;
  tier_1: number;
  tier_2: number;
  tier_3: number;
  high_intent_selected: number;
  long_tail_selected: number;
  inspiration_selected: number;
  seasonal_selected: number;
  duplicate_primaries: string[];
  mismatches: string[];
  unsupported_claims: string[];
  pins: PinSeoReport[];
}

export function buildWaveSeoReport(pins: PinSeoReport[]): WaveSeoReport {
  const primaries = pins.map((p) => p.primary_keyword);
  const counts = new Map<string, number>();
  for (const p of primaries) counts.set(p, (counts.get(p) ?? 0) + 1);
  const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  return {
    keywords_researched: DOG_KEYWORD_CATALOG.length,
    tier_1: DOG_KEYWORD_CATALOG.filter((k) => k.tier === 1).length,
    tier_2: DOG_KEYWORD_CATALOG.filter((k) => k.tier === 2).length,
    tier_3: DOG_KEYWORD_CATALOG.filter((k) => k.tier === 3).length,
    high_intent_selected: pins.filter((p) => DOG_KEYWORD_CATALOG.find((k) => k.keyword === p.primary_keyword)?.intent === "high_intent_product").length,
    long_tail_selected: pins.filter((p) => DOG_KEYWORD_CATALOG.find((k) => k.keyword === p.primary_keyword)?.intent === "long_tail_commercial").length,
    inspiration_selected: pins.filter((p) => DOG_KEYWORD_CATALOG.find((k) => k.keyword === p.primary_keyword)?.intent === "inspiration_save").length,
    seasonal_selected: pins.filter((p) => DOG_KEYWORD_CATALOG.find((k) => k.keyword === p.primary_keyword)?.intent === "seasonal").length,
    duplicate_primaries: duplicates,
    mismatches: pins.filter((p) => !p.aligned).map((p) => p.primary_keyword),
    unsupported_claims: pins.flatMap((p) => p.unsupported_claims),
    pins,
  };
}

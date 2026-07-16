// Pinterest Algorithm Signal Optimization layer.
//
// Deterministic relevance + quality scoring that a wave-runner MUST call
// before publishing any dog pin. Produces an Algorithm Signal Score (0-100)
// with per-axis breakdown and a hard PASS/FAIL verdict.
//
// Publish gate (all must hold):
//   total >= 90
//   keyword_relevance >= 18/20
//   pin_to_pdp_alignment >= 14/15
//   visual_recognition >= 14/15
//   board_relevance >= 9/10
//
// This is an internal quality model — it does NOT claim to mirror Pinterest's
// private ranking. It codifies operator relevance/freshness/alignment rules
// so we never publish a pin that looks like spam, clickbait or a duplicate.

import type { KeywordDef, ProductLike, ScoredKeyword } from "./pinterest-keyword-seo.ts";

export type SearchIntent = "product" | "planning" | "inspiration";

export interface PinCandidate {
  product: ProductLike & { primary_species?: string | null };
  primary_keyword: KeywordDef;
  keyword_plan?: ScoredKeyword;
  title: string;                    // 45–75 chars
  description: string;              // 300–500 chars ideally
  overlay: string;                  // ≤ 6 words
  alt_text: string;
  board_title: string;
  board_description?: string | null;
  destination_url: string;          // must be /products/{slug}
  pdp_h1?: string | null;
  pdp_copy?: string | null;         // concatenated PDP text
  intent: SearchIntent;
  image: {
    width: number;
    height: number;
    occupancy: number;              // 0..1 product area ratio
    identity_confidence: number;    // 0..1 vs PDP hero
    pdp_similarity: number;         // 0..1 vs PDP hero
    is_collage?: boolean;
    dominant_products?: number;     // count of clearly visible products
    phash?: string | null;
    color_palette_hash?: string | null;
  };
  trend?: {
    direction: "rising" | "steady" | "falling";
    seasonality: number;            // 0..1
  };
}

export interface RecentPin {
  product_slug: string;
  primary_keyword: string;
  title: string;
  description: string;
  overlay?: string | null;
  board_title: string;
  phash?: string | null;
  color_palette_hash?: string | null;
  published_at: string;             // ISO
}

export interface WavePin {
  product_slug: string;
  primary_keyword: string;
  intent: SearchIntent;
}

export interface SignalScoreAxes {
  keyword_relevance: number;   // 0–20
  visual_recognition: number;  // 0–15
  pin_to_pdp_alignment: number;// 0–15
  search_intent: number;       // 0–10
  save_potential: number;      // 0–10
  click_potential: number;     // 0–10
  board_relevance: number;     // 0–10
  freshness: number;           // 0–5
  trend_timing: number;        // 0–5
}

export interface SignalScore {
  total: number;               // 0–100
  axes: SignalScoreAxes;
  passes: boolean;
  reasons: string[];           // failure reasons if !passes
  unsupported_claims: string[];
  semantic_alignment: number;  // 0..1
}

const STOP = new Set(["the","and","for","with","your","from","a","an","of","to","in","on"]);

function tokens(s: string): string[] {
  return (s || "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));
}

function jaccard(a: string, b: string): number {
  const A = new Set(tokens(a)); const B = new Set(tokens(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function includesKeywordEarly(title: string, kw: string): boolean {
  const first = title.trim().split(/\s+/).slice(0, 5).join(" ").toLowerCase();
  return first.includes(kw.toLowerCase().split(/\s+/)[0] ?? "");
}

// Claims that require PDP evidence.
export const CLAIMS_NEEDING_EVIDENCE = [
  "orthopedic","no pull","no-pull","waterproof","washable","calming",
  "indestructible","hypoallergenic","reflective","non-slip","chew proof",
  "chew-proof","cooling","heated","memory foam",
];

export function findUnsupportedClaims(pin: PinCandidate): string[] {
  const pdp = `${pin.pdp_copy ?? ""} ${pin.product.description ?? ""} ${pin.product.name ?? ""}`.toLowerCase();
  const blob = `${pin.title} ${pin.description} ${pin.overlay}`.toLowerCase();
  return CLAIMS_NEEDING_EVIDENCE.filter((c) => blob.includes(c) && !pdp.includes(c));
}

// -----------------------------------------------------------------------------
// Per-axis scorers
// -----------------------------------------------------------------------------

function scoreKeywordRelevance(pin: PinCandidate): { v: number; why: string[] } {
  const why: string[] = [];
  const kw = pin.primary_keyword.keyword;
  let v = 0;
  if (includesKeywordEarly(pin.title, kw)) v += 6; else why.push("primary_keyword_not_in_title_head");
  if (pin.description.toLowerCase().split(/[.!?]/)[0].includes(kw.toLowerCase().split(/\s+/)[0])) v += 4;
  else why.push("primary_keyword_missing_from_first_sentence");
  if (pin.title.length >= 45 && pin.title.length <= 75) v += 3; else why.push("title_length_out_of_range");
  if (pin.description.length >= 200 && pin.description.length <= 500) v += 3; else why.push("description_length_out_of_range");
  // Anti keyword stuffing: keyword appears more than 3 times => penalty.
  const occ = (pin.description.toLowerCase().match(new RegExp(kw.toLowerCase(), "g")) || []).length;
  if (occ <= 3) v += 4; else why.push("primary_keyword_stuffed");
  return { v: Math.min(20, v), why };
}

function scoreVisualRecognition(pin: PinCandidate): { v: number; why: string[] } {
  const why: string[] = [];
  let v = 0;
  const ratio = pin.image.height / Math.max(1, pin.image.width);
  if (Math.abs(ratio - 1.5) < 0.05) v += 3; else why.push("aspect_ratio_not_2_3");
  if (pin.image.width >= 1000) v += 2; else why.push("resolution_below_1000w");
  if (pin.image.occupancy >= 0.45 && pin.image.occupancy <= 0.65) v += 4;
  else why.push(`occupancy_out_of_band_${pin.image.occupancy.toFixed(2)}`);
  if (pin.image.identity_confidence >= 0.98) v += 3; else why.push(`identity_confidence_${pin.image.identity_confidence.toFixed(2)}`);
  if (!pin.image.is_collage) v += 2; else why.push("collage_detected");
  if ((pin.image.dominant_products ?? 1) === 1) v += 1; else why.push("multiple_dominant_products");
  return { v: Math.min(15, v), why };
}

function scorePinToPdpAlignment(pin: PinCandidate): { v: number; why: string[]; sem: number } {
  const why: string[] = [];
  let v = 0;
  // URL must be /products/{slug} with utm_source=pinterest
  const slug = (pin.product.slug ?? "").toLowerCase();
  if (slug && pin.destination_url.includes(`/products/${slug}`)) v += 4; else why.push("destination_slug_mismatch");
  if (/[?&]utm_source=pinterest\b/i.test(pin.destination_url)) v += 1; else why.push("missing_utm_source");
  // PDP hero similarity
  if (pin.image.pdp_similarity >= 0.97) v += 3; else why.push(`pdp_similarity_${pin.image.pdp_similarity.toFixed(2)}`);
  // Semantic alignment across pin + PDP surfaces.
  const pinBlob = `${pin.title} ${pin.description} ${pin.overlay} ${pin.alt_text} ${pin.board_title} ${pin.board_description ?? ""}`;
  const pdpBlob = `${pin.pdp_h1 ?? ""} ${pin.pdp_copy ?? ""} ${pin.product.name ?? ""} ${pin.product.description ?? ""}`;
  const sem = jaccard(pinBlob, pdpBlob);
  if (sem >= 0.30) v += 3; else why.push(`semantic_overlap_low_${sem.toFixed(2)}`);
  // Primary keyword tokens must be present on PDP
  const kwTokens = tokens(pin.primary_keyword.keyword);
  const pdpTokens = new Set(tokens(pdpBlob));
  const kwHit = kwTokens.filter((t) => pdpTokens.has(t)).length / Math.max(1, kwTokens.length);
  if (kwHit >= 0.9) v += 3; else why.push(`pdp_keyword_coverage_${kwHit.toFixed(2)}`);
  // Unsupported claims: hard penalty
  const unsupported = findUnsupportedClaims(pin);
  if (unsupported.length === 0) v += 1; else why.push(`unsupported_claims:${unsupported.join(",")}`);
  // Normalize semantic alignment to 0..1 blend (jaccard is naturally low; use scaled version).
  const semNorm = Math.min(1, sem * 3);
  return { v: Math.min(15, v), why, sem: semNorm };
}

function scoreSearchIntent(pin: PinCandidate): { v: number; why: string[] } {
  const why: string[] = [];
  const intent = pin.primary_keyword.intent;
  // product ↔ high_intent_product; planning ↔ long_tail_commercial; inspiration ↔ inspiration_save/seasonal
  const ok =
    (pin.intent === "product" && intent === "high_intent_product") ||
    (pin.intent === "planning" && intent === "long_tail_commercial") ||
    (pin.intent === "inspiration" && (intent === "inspiration_save" || intent === "seasonal"));
  let v = ok ? 10 : 4;
  if (!ok) why.push(`intent_mismatch:${pin.intent}_vs_${intent}`);
  return { v, why };
}

function scoreSavePotential(pin: PinCandidate): { v: number; why: string[] } {
  const why: string[] = [];
  let v = Math.round(pin.primary_keyword.save * 8);
  // Overlay length bonus
  const words = pin.overlay.trim().split(/\s+/).filter(Boolean).length;
  if (words >= 2 && words <= 6) v += 2; else why.push("overlay_word_count_out_of_range");
  return { v: Math.min(10, v), why };
}

const CLICK_CUES = /(see|explore|view|discover|shop|find|inside|how|why)/i;
const CLICKBAIT = /(shocking|unbelievable|you won'?t believe|secret|hack|trick)/i;

function scoreClickPotential(pin: PinCandidate): { v: number; why: string[] } {
  const why: string[] = [];
  let v = 4;
  if (CLICK_CUES.test(pin.title) || CLICK_CUES.test(pin.description)) v += 3;
  if (pin.primary_keyword.commercial >= 0.8) v += 3;
  if (CLICKBAIT.test(pin.title) || CLICKBAIT.test(pin.description)) { v -= 6; why.push("clickbait_detected"); }
  return { v: Math.max(0, Math.min(10, v)), why };
}

function scoreBoardRelevance(pin: PinCandidate): { v: number; why: string[] } {
  const why: string[] = [];
  const boardTokens = new Set(tokens(pin.board_title + " " + (pin.board_description ?? "")));
  const topicTokens = tokens(pin.primary_keyword.board_topic);
  const hit = topicTokens.filter((t) => boardTokens.has(t)).length / Math.max(1, topicTokens.length);
  let v = Math.round(hit * 10);
  if (hit < 0.5) why.push(`board_topic_mismatch_${hit.toFixed(2)}`);
  // Species alignment
  const species = (pin.product.primary_species ?? "").toLowerCase();
  if (species === "cat" && /dog/i.test(pin.board_title)) { v = 0; why.push("species_mismatch"); }
  return { v: Math.max(0, Math.min(10, v)), why };
}

function scoreFreshness(pin: PinCandidate, recent: RecentPin[]): { v: number; why: string[] } {
  const why: string[] = [];
  let v = 5;
  for (const r of recent) {
    if (r.product_slug === pin.product.slug) {
      const ageDays = (Date.now() - Date.parse(r.published_at)) / 86400000;
      if (ageDays < 14) { v = 0; why.push(`product_cooldown_${ageDays.toFixed(1)}d`); break; }
    }
    if (r.primary_keyword.toLowerCase() === pin.primary_keyword.keyword.toLowerCase()) {
      const ageDays = (Date.now() - Date.parse(r.published_at)) / 86400000;
      if (ageDays < 30) { v = Math.min(v, 1); why.push("keyword_cooldown"); }
    }
    if (r.phash && pin.image.phash && r.phash === pin.image.phash) { v = 0; why.push("duplicate_phash"); break; }
    if (r.title.trim().toLowerCase() === pin.title.trim().toLowerCase()) { v = Math.min(v, 1); why.push("duplicate_title"); }
    if (r.description.trim().toLowerCase() === pin.description.trim().toLowerCase()) { v = Math.min(v, 1); why.push("duplicate_description"); }
  }
  return { v, why };
}

function scoreTrendTiming(pin: PinCandidate): { v: number; why: string[] } {
  const why: string[] = [];
  const dir = pin.trend?.direction ?? "steady";
  const season = pin.trend?.seasonality ?? pin.primary_keyword.seasonality ?? 0.5;
  let v = 0;
  if (dir === "rising") v += 3; else if (dir === "steady") v += 2; else { v += 0; why.push("trend_falling"); }
  v += Math.round(season * 2);
  return { v: Math.min(5, v), why };
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export const SIGNAL_GATES = {
  total: 90,
  keyword_relevance: 18,
  pin_to_pdp_alignment: 14,
  visual_recognition: 14,
  board_relevance: 9,
  semantic_alignment: 0.95,
} as const;

export function scoreAlgorithmSignals(pin: PinCandidate, recent: RecentPin[] = []): SignalScore {
  const kr = scoreKeywordRelevance(pin);
  const vr = scoreVisualRecognition(pin);
  const pa = scorePinToPdpAlignment(pin);
  const si = scoreSearchIntent(pin);
  const sp = scoreSavePotential(pin);
  const cp = scoreClickPotential(pin);
  const br = scoreBoardRelevance(pin);
  const fr = scoreFreshness(pin, recent);
  const tt = scoreTrendTiming(pin);

  const axes: SignalScoreAxes = {
    keyword_relevance: kr.v,
    visual_recognition: vr.v,
    pin_to_pdp_alignment: pa.v,
    search_intent: si.v,
    save_potential: sp.v,
    click_potential: cp.v,
    board_relevance: br.v,
    freshness: fr.v,
    trend_timing: tt.v,
  };
  const total = Object.values(axes).reduce((a, b) => a + b, 0);
  const unsupported = findUnsupportedClaims(pin);

  // Composite semantic alignment: blend jaccard-normalised + PDP keyword coverage + URL slug match.
  const semantic_alignment = pa.sem;

  const reasons: string[] = [
    ...kr.why, ...vr.why, ...pa.why, ...si.why, ...sp.why, ...cp.why, ...br.why, ...fr.why, ...tt.why,
  ];

  const passes =
    total >= SIGNAL_GATES.total &&
    axes.keyword_relevance >= SIGNAL_GATES.keyword_relevance &&
    axes.pin_to_pdp_alignment >= SIGNAL_GATES.pin_to_pdp_alignment &&
    axes.visual_recognition >= SIGNAL_GATES.visual_recognition &&
    axes.board_relevance >= SIGNAL_GATES.board_relevance &&
    unsupported.length === 0;

  if (!passes && total < SIGNAL_GATES.total) reasons.unshift(`total_below_gate_${total}`);

  return {
    total,
    axes,
    passes,
    reasons,
    unsupported_claims: unsupported,
    semantic_alignment,
  };
}

// -----------------------------------------------------------------------------
// Wave-level checks (intent mix + no duplicate primary keywords per wave)
// -----------------------------------------------------------------------------

export interface WaveIntentReport {
  ok: boolean;
  duplicate_primary_keywords: string[];
  duplicate_slugs: string[];
  intent_distribution: Record<SearchIntent, number>;
  missing_intents: SearchIntent[];
}

export function auditWave(pins: readonly WavePin[]): WaveIntentReport {
  const seenKw = new Map<string, number>();
  const seenSlug = new Map<string, number>();
  const dist: Record<SearchIntent, number> = { product: 0, planning: 0, inspiration: 0 };
  for (const p of pins) {
    seenKw.set(p.primary_keyword.toLowerCase(), (seenKw.get(p.primary_keyword.toLowerCase()) ?? 0) + 1);
    seenSlug.set(p.product_slug, (seenSlug.get(p.product_slug) ?? 0) + 1);
    dist[p.intent]++;
  }
  const duplicate_primary_keywords = [...seenKw.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  const duplicate_slugs = [...seenSlug.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  const missing_intents: SearchIntent[] = pins.length >= 3
    ? (["product", "planning", "inspiration"] as SearchIntent[]).filter((i) => dist[i] === 0)
    : [];
  return {
    ok: duplicate_primary_keywords.length === 0 && duplicate_slugs.length === 0 && missing_intents.length === 0,
    duplicate_primary_keywords,
    duplicate_slugs,
    intent_distribution: dist,
    missing_intents,
  };
}

// -----------------------------------------------------------------------------
// Per-pin report (for the operator-facing wave summary)
// -----------------------------------------------------------------------------

export interface PinAlgorithmReport {
  product_slug: string;
  primary_topic: string;
  primary_keyword: string;
  secondary_keywords: string[];
  search_intent: SearchIntent;
  trend_direction: "rising" | "steady" | "falling";
  seo_title: string;
  description: string;
  overlay: string;
  board: string;
  pdp_h1: string | null;
  scores: SignalScoreAxes & { total: number; semantic_alignment: number };
  destination_verified: boolean;
  passes: boolean;
  reasons: string[];
  unsupported_claims: string[];
}

export function buildPinReport(
  pin: PinCandidate,
  score: SignalScore,
  secondary_keywords: string[],
  destination_verified: boolean,
): PinAlgorithmReport {
  return {
    product_slug: pin.product.slug ?? "",
    primary_topic: pin.primary_keyword.board_topic,
    primary_keyword: pin.primary_keyword.keyword,
    secondary_keywords,
    search_intent: pin.intent,
    trend_direction: pin.trend?.direction ?? "steady",
    seo_title: pin.title,
    description: pin.description,
    overlay: pin.overlay,
    board: pin.board_title,
    pdp_h1: pin.pdp_h1 ?? null,
    scores: { ...score.axes, total: score.total, semantic_alignment: score.semantic_alignment },
    destination_verified,
    passes: score.passes && destination_verified,
    reasons: score.reasons,
    unsupported_claims: score.unsupported_claims,
  };
}
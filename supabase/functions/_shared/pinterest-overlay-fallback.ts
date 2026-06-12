// ─────────────────────────────────────────────────────────────────────────────
// Pinterest — Category-aware overlay fallback & guardrails
// ─────────────────────────────────────────────────────────────────────────────
// Used by pinterest-viral-batch (and any other generator) as the LAST RESORT
// when an AI-generated topOverlay is missing.  Replaces the legacy hard-coded
// litter-cleaning default which leaked litter-box copy onto cat trees,
// carriers, beds, fountains, etc. — a known Pinterest quality-score
// regression (creative_mismatch).
//
// Two surfaces:
//   1. pickCategoryOverlay(categoryKey, seed) — deterministic category-safe
//      headline from a small per-category pool.
//   2. validateOverlayForCategory(overlay, categoryKey) — guardrail invoked
//      right before insert to refuse litter/scoop copy on non-litter products
//      (and symmetric niche rules). Returns { ok, reason, repaired }.
// ─────────────────────────────────────────────────────────────────────────────

// Match the categoryKey values produced by resolveCategoryKey() in
// pinterest-hooks.ts ("litter-boxes" | "cat-trees" | "dog-beds" | "dog-travel"
// | "default") AND the legacy db values still floating around the queue
// ("cat-litter", "cat_litter", "cat_litter_boxes", "cat_trees", "cat-trees",
// "cat_essentials", "dog_travel", "dog-travel", "dog-beds", "dog_beds", …).

const NORMALIZE: Record<string, string> = {
  // litter
  "litter-boxes": "litter",
  "litter_boxes": "litter",
  "cat-litter": "litter",
  "cat_litter": "litter",
  "cat_litter_boxes": "litter",
  // cat tree
  "cat-trees": "cat_tree",
  "cat_trees": "cat_tree",
  // beds
  "dog-beds": "dog_bed",
  "dog_beds": "dog_bed",
  "cat-beds": "cat_bed",
  "cat_beds": "cat_bed",
  // travel / carriers
  "dog-travel": "carrier",
  "dog_travel": "carrier",
  "cat-carrier": "carrier",
  "cat_carrier": "carrier",
  "pet-carrier": "carrier",
  // feeding & water
  "feeders": "feeding",
  "bowls": "feeding",
  "fountain": "feeding",
  // grooming
  "grooming": "grooming",
  // catch-all
  "cat_essentials": "default",
  "default": "default",
  // 2026-06-11 — board-name aliases that flow through the queue.
  "cat-seat-cover": "car_seat",
  "dog-seat-cover": "car_seat",
  "car-seat-cover": "car_seat",
  "car_seat_cover": "car_seat",
};

export type OverlayBucket =
  | "litter"
  | "cat_tree"
  | "dog_bed"
  | "cat_bed"
  | "carrier"
  | "feeding"
  | "grooming"
  | "car_seat"
  | "default";

export function normalizeCategoryKey(
  categoryKey: string | null | undefined,
  productCategory?: string | null,
): OverlayBucket {
  const raw = (categoryKey || "").toLowerCase().trim();
  if (NORMALIZE[raw]) return NORMALIZE[raw] as OverlayBucket;
  const blob = `${categoryKey ?? ""} ${productCategory ?? ""}`.toLowerCase();
  if (/litter/.test(blob)) return "litter";
  if (/cat\s*tree|cat\s*tower|cat\s*condo|scratch/.test(blob)) return "cat_tree";
  if (/dog\s*bed|orthopedic/.test(blob)) return "dog_bed";
  if (/cat\s*bed/.test(blob)) return "cat_bed";
  if (/carrier|travel|stroller|backpack/.test(blob)) return "carrier";
  if (/bowl|feeder|fountain|water/.test(blob)) return "feeding";
  if (/groom|brush|nail|wipe|bath|shampoo/.test(blob)) return "grooming";
  if (/seat\s*cover|car\s*seat|back\s*seat|hammock\s*seat/.test(blob)) return "car_seat";
  return "default";
}

// Category-safe overlay pools (≤42 chars, GMC-safe, US-native tone). The
// "default" pool is intentionally generic — never product-specific — so it
// can't accidentally mismatch a niche.
const OVERLAY_POOLS: Record<OverlayBucket, string[]> = {
  litter: [
    "Less mess",
    "Odor control",
    "Easy cleaning",
    "Cleaner litter, less work",
    "A cleaner litter routine",
    "Less litter on the floor",
  ],
  cat_tree: [
    "Built for large cats",
    "Stable climbing tower",
    "Multi-level cat playground",
    "Sturdy scratching post",
    "Cat tree that stays put",
  ],
  dog_bed: [
    "Deeper sleep, every night",
    "Joint support, quiet corner",
    "A cozy spot they pick first",
    "Orthopedic comfort, daily rest",
  ],
  cat_bed: [
    "Their favorite cozy nook",
    "A cat-sized cozy hideaway",
    "Sunbeam naps, every day",
    "Cozy rest for indoor cats",
  ],
  carrier: [
    "Stress-free travel days",
    "Calmer vet trips",
    "Built for stress-free outings",
    "Comfortable on the go",
  ],
  feeding: [
    "Tidy mealtimes, daily",
    "Fresh water, all day",
    "No more spills",
    "Easier feeding routine",
  ],
  grooming: [
    "Less shedding, cleaner home",
    "A softer, healthier coat",
    "Easy at-home grooming",
    "Brush less, enjoy more",
  ],
  car_seat: [
    "Protect your car seats",
    "Easy to clean",
    "Waterproof protection",
    "Hair and mud stay off seats",
    "Tough seat cover for dogs",
  ],
  default: [
    "A small upgrade they love",
    "Made for everyday pet life",
    "The easy swap we made",
    "A quieter, tidier routine",
  ],
};

// Positive vocabulary per bucket. The overlay must hit at least one of these
// tokens (case-insensitive) OR be drawn straight from OVERLAY_POOLS for the
// same bucket. This catches "Smart cat parents love it" on a cat tree, which
// passes the FORBIDDEN_TOKENS check but is clearly off-niche.
const REQUIRED_VOCAB: Record<OverlayBucket, RegExp | null> = {
  litter: /\b(litter|scoop|odor|mess|smell|clean|fresh|tracking|granule|box)\b/i,
  cat_tree: /\b(cat|tree|tower|climb|climbing|scratch|scratching|perch|condo|playground|multi[-\s]?level)\b/i,
  dog_bed: /\b(dog|bed|sleep|orthopedic|joint|cozy|nap|rest|cushion)\b/i,
  cat_bed: /\b(cat|bed|nap|cozy|sleep|hideaway|nook|sunbeam)\b/i,
  carrier: /\b(travel|carrier|trip|vet|stroller|backpack|outing|on the go)\b/i,
  feeding: /\b(feed|feeder|meal|bowl|water|fountain|drink|spill|portion)\b/i,
  grooming: /\b(groom|brush|shed|coat|nail|bath|fur|wipe)\b/i,
  car_seat: /\b(car|seat|cover|hammock|back\s*seat|waterproof|protect|hair|mud|leather|upholstery)\b/i,
  default: null,
};

/** Deterministic category-safe fallback overlay. */
export function pickCategoryOverlay(
  categoryKey: string | null | undefined,
  seed: number,
  productCategory?: string | null,
): string {
  const bucket = normalizeCategoryKey(categoryKey, productCategory);
  const pool = OVERLAY_POOLS[bucket] || OVERLAY_POOLS.default;
  const idx = Math.abs(Math.floor(seed)) % pool.length;
  return pool[idx];
}

// Forbidden-token map. The key is the *bucket*, the value is the regex of
// niche-foreign tokens that must NOT appear in that bucket's overlay copy.
const FORBIDDEN_TOKENS: Record<OverlayBucket, RegExp | null> = {
  // Litter copy is the most-overused leak. Allow on litter only.
  litter: null,
  cat_tree: /\b(scoop|scooping|litter\s*box|litter|car\s*seat|hammock)\b/i,
  dog_bed: /\b(scoop|scooping|litter\s*box|litter|odor[-\s]?free|hydrat)\b/i,
  cat_bed: /\b(scoop|scooping|litter\s*box|litter|odor[-\s]?free|hydrat)\b/i,
  carrier: /\b(scoop|scooping|litter\s*box|litter|odor[-\s]?free)\b/i,
  feeding: /\b(scoop|scooping|litter\s*box|litter)\b/i,
  grooming: /\b(scoop|scooping|litter\s*box|litter)\b/i,
  car_seat: /\b(scoop|scooping|litter\s*box|litter|cat\s*tree|brush|groom|fountain)\b/i,
  default: /\b(scoop|scooping|litter\s*box)\b/i,
};

export interface OverlayValidation {
  ok: boolean;
  reason?: string;
  repaired?: string;
  bucket: OverlayBucket;
}

/**
 * Guardrail: validate an overlay string against the product's category bucket.
 * Returns ok=false and a `repaired` replacement if the overlay leaks copy
 * that belongs to a different niche (for example, litter-cleaning copy on a cat tree).
 */
export function validateOverlayForCategory(
  overlay: string,
  categoryKey: string | null | undefined,
  opts: { seed?: number; productCategory?: string | null } = {},
): OverlayValidation {
  const bucket = normalizeCategoryKey(categoryKey, opts.productCategory);
  const seed = typeof opts.seed === "number" ? opts.seed : ((overlay || "").length * 31 || 7);
  const text = String(overlay || "");

  // 1. Forbidden cross-niche tokens.
  const forbidden = FORBIDDEN_TOKENS[bucket];
  if (forbidden && text && forbidden.test(text)) {
    return {
      ok: false,
      reason: `creative_mismatch:foreign_niche_copy(bucket=${bucket})`,
      repaired: pickCategoryOverlay(categoryKey, seed, opts.productCategory),
      bucket,
    };
  }

  // 2. Empty overlay is repaired but not flagged here — QA handles missing copy.
  if (!text.trim()) return { ok: true, bucket };

  // 3. Positive-match: overlay must use category vocabulary OR be a safe
  //    pool entry for this bucket. Otherwise it's category-agnostic copy
  //    (e.g. "Smart cat parents love it") which we treat as a mismatch.
  const required = REQUIRED_VOCAB[bucket];
  const pool = OVERLAY_POOLS[bucket] || [];
  const normalised = text.toLowerCase().trim();
  const inPool = pool.some((p) => p.toLowerCase() === normalised);
  if (required && !required.test(text) && !inPool) {
    return {
      ok: false,
      reason: `creative_mismatch:missing_category_vocab(bucket=${bucket})`,
      repaired: pickCategoryOverlay(categoryKey, seed, opts.productCategory),
      bucket,
    };
  }

  return { ok: true, bucket };
}

/**
 * Guardrail for title/description copy. Same forbidden-token logic as the
 * overlay validator but skips the positive-vocab requirement (titles can be
 * brand-led or product-name driven). Catches cross-niche leaks like
 * "Plush, warm, easy to wash" landing on a cat-toy pin, or "Stop scooping"
 * leaking onto a dog-bed title.
 */
export function validateCopyForCategory(
  text: string | null | undefined,
  categoryKey: string | null | undefined,
  field: "title" | "description",
  opts: { productCategory?: string | null } = {},
): OverlayValidation {
  const bucket = normalizeCategoryKey(categoryKey, opts.productCategory);
  const raw = String(text || "");
  const forbidden = FORBIDDEN_TOKENS[bucket];
  if (forbidden && raw && forbidden.test(raw)) {
    return {
      ok: false,
      reason: `creative_mismatch:${field}_foreign_niche(bucket=${bucket})`,
      bucket,
    };
  }
  // Additional cross-niche pattern: plush/warm/wash copy on cat toys.
  if (bucket !== "dog_bed" && bucket !== "cat_bed" && /\bplush\b.*\b(warm|wash)\b/i.test(raw)) {
    return {
      ok: false,
      reason: `creative_mismatch:${field}_plush_leak(bucket=${bucket})`,
      bucket,
    };
  }
  return { ok: true, bucket };
}

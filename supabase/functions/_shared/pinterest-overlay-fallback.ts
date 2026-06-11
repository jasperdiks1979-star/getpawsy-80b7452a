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
};

export type OverlayBucket =
  | "litter"
  | "cat_tree"
  | "dog_bed"
  | "cat_bed"
  | "carrier"
  | "feeding"
  | "grooming"
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
  return "default";
}

// Category-safe overlay pools (≤42 chars, GMC-safe, US-native tone). The
// "default" pool is intentionally generic — never product-specific — so it
// can't accidentally mismatch a niche.
const OVERLAY_POOLS: Record<OverlayBucket, string[]> = {
  litter: [
    "Cleaner litter, less work",
    "End litter box odor",
    "A cleaner litter routine",
    "Less mess, fresher home",
  ],
  cat_tree: [
    "A cat tree they actually use",
    "Climb, scratch, lounge",
    "Vertical space for indoor cats",
    "The cat tree that stays standing",
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
  default: [
    "A small upgrade they love",
    "Made for everyday pet life",
    "The easy swap we made",
    "A quieter, tidier routine",
  ],
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
  cat_tree: /\b(scoop|scooping|litter\s*box|litter)\b/i,
  dog_bed: /\b(scoop|scooping|litter\s*box|litter|odor[-\s]?free|hydrat)\b/i,
  cat_bed: /\b(scoop|scooping|litter\s*box|litter|odor[-\s]?free|hydrat)\b/i,
  carrier: /\b(scoop|scooping|litter\s*box|litter|odor[-\s]?free)\b/i,
  feeding: /\b(scoop|scooping|litter\s*box|litter)\b/i,
  grooming: /\b(scoop|scooping|litter\s*box|litter)\b/i,
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
  const re = FORBIDDEN_TOKENS[bucket];
  if (!re) return { ok: true, bucket };
  if (!overlay || !re.test(overlay)) return { ok: true, bucket };
  const seed = typeof opts.seed === "number" ? opts.seed : (overlay.length * 31);
  return {
    ok: false,
    reason: `creative_mismatch:foreign_niche_copy(bucket=${bucket})`,
    repaired: pickCategoryOverlay(categoryKey, seed, opts.productCategory),
    bucket,
  };
}

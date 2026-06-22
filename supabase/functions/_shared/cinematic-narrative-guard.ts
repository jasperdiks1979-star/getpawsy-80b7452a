/**
 * Cinematic narrative QA guard.
 *
 * Single source of truth for detecting when a voiceover script / pin copy
 * was generated for the wrong product category (e.g. the legacy
 * "Tired of scooping every day…" litter-box fallback that leaked onto cat
 * trees, dog beds, water fountains, car seat covers, …).
 *
 * Used by:
 *   - cinematic-ad-prepare         (product-aware DEFAULT_VO)
 *   - cinematic-ad-autopublish     (publish-time hard gate)
 *   - cinematic-v3-post-approval   (queue-time hard gate)
 *   - cinematic-recovery-worker    (mass repair of legacy rows)
 */

export type ProductLike = {
  name?: string | null;
  slug?: string | null;
  category?: string | null;
  description?: string | null;
  tags?: string[] | null;
  primary_species?: string | null;
};

/** Category keyword map. Extend as new categories surface in QA failures. */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  litter: ["litter", "scoop", "scooping", "self-cleaning", "odor control"],
  bed: ["bed", "mattress", "sleeping", "pillow", "cushion"],
  feeder: ["feeder", "feeding", "kibble", "bowl", "auto feed"],
  fountain: ["fountain", "water dispenser", "hydration"],
  toy: ["toy", "play", "fetch", "tug", "chew"],
  grooming: ["groomer", "trimmer", "clipper", "brush", "shedding"],
  carrier: ["carrier", "travel", "backpack", "car seat", "harness"],
  tree: ["cat tree", "scratching post", "condo"],
  tent: ["tent", "kennel", "house", "enclosure"],
};

/** Phrases that MUST NOT appear unless the product is actually a litter box. */
const LITTER_LOCKED_PHRASES = [
  "scoop",
  "scooping",
  "self-cleaning litter",
  "stop scooping",
  "less scooping",
  "fresher home",
  "tired of scooping",
  "odors and litter",
  "fully enclosed",
];

export function classifyCategory(p: ProductLike): keyof typeof CATEGORY_KEYWORDS | null {
  const hay = [
    p.category ?? "",
    p.name ?? "",
    p.slug ?? "",
    (p.tags ?? []).join(" "),
  ].join(" ").toLowerCase();
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => hay.includes(w))) return cat as keyof typeof CATEGORY_KEYWORDS;
  }
  return null;
}

export function isLitterProduct(p: ProductLike): boolean {
  return classifyCategory(p) === "litter";
}

/**
 * Returns the first banned phrase found in the script, or null if the copy
 * is acceptable for the given product. Honest litter products are exempt.
 */
export function detectNarrativeLeak(p: ProductLike, ...texts: (string | null | undefined)[]): string | null {
  if (isLitterProduct(p)) return null;
  const blob = texts.filter(Boolean).join("\n").toLowerCase();
  for (const phrase of LITTER_LOCKED_PHRASES) {
    if (blob.includes(phrase)) return phrase;
  }
  return null;
}

/**
 * Verify that voiceover topic, video topic, product title and product
 * category all reference the same subject. Returns ok=false with reason
 * when any axis disagrees.
 */
export function validateNarrativeAlignment(
  p: ProductLike,
  voiceoverText: string | null | undefined,
  videoTopic: string | null | undefined,
): { ok: true } | { ok: false; reason: string } {
  const leak = detectNarrativeLeak(p, voiceoverText, videoTopic);
  if (leak) return { ok: false, reason: `narrative_leak:${leak}` };
  const productName = (p.name ?? "").trim();
  if (productName && voiceoverText && !voiceoverText.toLowerCase().includes(productName.toLowerCase().split(/\s+/).slice(0, 2).join(" "))) {
    // Soft signal — VO doesn't reference even the first two words of the
    // product name. Treat as misalignment.
    return { ok: false, reason: "product_name_absent_from_voiceover" };
  }
  return { ok: true };
}

/**
 * Product-aware safe voiceover used only when AI copy generation fails.
 * Replaces the legacy litter-box DEFAULT_VO so the pipeline can never
 * leak cross-category copy again.
 */
export function buildSafeFallbackVO(p: ProductLike): string {
  const name = (p.name ?? "this pet essential").trim() || "this pet essential";
  const species = (p.primary_species ?? "").trim().toLowerCase();
  const audience = species === "cat" ? "your cat" : species === "dog" ? "your dog" : "your pet";
  const cat = classifyCategory(p);
  const benefit = (() => {
    switch (cat) {
      case "litter":    return "less scooping, fresher home";
      case "bed":       return "deeper sleep, calmer days";
      case "feeder":    return "consistent meals, less mess";
      case "fountain":  return "fresher water, better hydration";
      case "toy":       return "more play, less boredom";
      case "grooming":  return "salon-fresh coat at home";
      case "carrier":   return "easier trips, calmer rides";
      case "tree":      return "more climbing, happier cat";
      case "tent":      return "a cozy retreat anywhere";
      default:          return "premium quality made for pet parents";
    }
  })();
  return `Meet ${name}. Designed for ${audience} — ${benefit}. Crafted with premium materials and finished to last. See it at GetPawsy dot pet.`;
}

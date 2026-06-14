// Pinterest Revenue Engine V4 — priority categories (70% floor) + tier-1 country weights.
//
// Used by `pinterest-growth-engine` slate picker and by `pinterest-revenue-engine-loop`.

// Top-5 categories that must originate ≥70% of new Pinterest content until another
// category statistically outperforms them (rolling 30d Pinterest revenue).
export const PRIORITY_CATEGORIES = [
  "self-cleaning-litter-box",
  "cat-litter-boxes",
  "cat-trees",
  "cat-furniture",
  "luxury-pet-beds",
  "smart-pet-gadgets",
] as const;

/**
 * Hybrid cap (replaces the old 70% floor).
 * Priority categories combined may not exceed 40% of any picked slate.
 * The old constant name is kept as an alias for back-compat with engines
 * that import it, but it now carries the cap value.
 */
export const PRIORITY_CATEGORY_CAP = 0.4; // 40% combined ceiling
export const PRIORITY_CATEGORY_FLOOR = PRIORITY_CATEGORY_CAP; // alias, deprecated

// Match by slug substring (categories slug vary in DB).
export function isPriorityCategory(catKey: string | null | undefined): boolean {
  if (!catKey) return false;
  const k = catKey.toLowerCase();
  return (
    /litter/.test(k) ||
    /cat.?tree/.test(k) ||
    /cat.?furniture/.test(k) ||
    /(luxury|premium).*bed/.test(k) ||
    /smart.*pet/.test(k) ||
    /smart.*gadget/.test(k)
  );
}

// Tier-1 country weights — Phase 1 weighted scoring.
// US clicks weight 5 · saves 4 · outbound 8 · conversions 15.
// CA gets 60% of US weight, AU 40%. Others get 10%.
export const TIER1_COUNTRY_WEIGHT: Record<string, number> = {
  US: 1.0,
  CA: 0.6,
  AU: 0.4,
};
export const OTHER_COUNTRY_WEIGHT = 0.1;

export function countryWeight(country: string | null | undefined): number {
  if (!country) return OTHER_COUNTRY_WEIGHT;
  const c = country.trim().toUpperCase();
  if (c === "US" || c.startsWith("UNITED STATES")) return TIER1_COUNTRY_WEIGHT.US;
  if (c === "CA" || c.startsWith("CANADA")) return TIER1_COUNTRY_WEIGHT.CA;
  if (c === "AU" || c.startsWith("AUSTRALIA")) return TIER1_COUNTRY_WEIGHT.AU;
  return OTHER_COUNTRY_WEIGHT;
}

export const EVENT_WEIGHTS = {
  click: 5,
  save: 4,
  outbound_click: 8,
  conversion: 15,
} as const;
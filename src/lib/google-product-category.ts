/**
 * Google Product Category mapper — frontend mirror.
 *
 * Canonical implementation lives in
 *   supabase/functions/_shared/google-product-category.ts
 * Both files MUST stay byte-identical (excluding this header) because
 * Deno edge functions cannot import from the Vite src/ tree.
 *
 * Returns both the numeric Google taxonomy ID (required for GMC feeds)
 * and the full taxonomy path (used in CSV exports + admin UI).
 */

export interface GpcMatch {
  /** Numeric Google taxonomy ID (e.g. 5010 for Cat Litter Boxes) */
  id: number;
  /** Internal short key (e.g. "litter_box") */
  key: string;
  /** Full Google taxonomy path */
  path: string;
  /** Human-readable canonical category label used internally (e.g. "Cat Litter Boxes") */
  canonical: string;
  /** Detected species: 'cat' | 'dog' | 'pet' */
  species: "cat" | "dog" | "pet";
  /** True when classification is confident (matched a sub-category rule, not just fallback) */
  confident: boolean;
}

/** Catalog of every taxonomy node we map to. */
export const GPC_CATALOG = {
  // ── Cat ────────────────────────────────────────────────────────────
  cat_tree:        { id: 3367, canonical: "Cat Trees & Condos",     path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture > Cat Trees & Condos" },
  cat_furniture:   { id: 5007, canonical: "Cat Furniture",          path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture" },
  cat_bed:         { id: 5008, canonical: "Cat Beds",               path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Furniture > Cat Beds" },
  litter_box:      { id: 5010, canonical: "Cat Litter Boxes",       path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Litter Box Supplies > Cat Litter Boxes" },
  cat_litter_acc:  { id: 5011, canonical: "Cat Litter Accessories", path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Litter Box Supplies" },
  cat_toy:         { id: 5019, canonical: "Cat Toys",               path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Toys" },
  cat_carrier:     { id: 6983, canonical: "Cat Carriers",           path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Carriers & Strollers" },
  cat_bowl:        { id: 5017, canonical: "Cat Bowls & Feeders",    path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Feeding & Watering Supplies" },
  cat_collar:      { id: 5016, canonical: "Cat Collars",            path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Apparel" },
  cat_grooming:    { id: 5015, canonical: "Cat Grooming",           path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies > Cat Grooming Supplies" },
  cat_general:     { id: 3261, canonical: "Cat Supplies",           path: "Animals & Pet Supplies > Pet Supplies > Cat Supplies" },

  // ── Dog ────────────────────────────────────────────────────────────
  dog_bed:         { id: 4985, canonical: "Dog Beds",               path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Beds" },
  dog_toy:         { id: 5004, canonical: "Dog Toys",               path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Toys" },
  dog_collar:      { id: 5001, canonical: "Dog Collars & Leashes",  path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Collars, Harnesses & Leashes" },
  dog_bowl:        { id: 4997, canonical: "Dog Bowls & Feeders",    path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Feeding & Watering Supplies" },
  dog_house:       { id: 6981, canonical: "Dog Houses",             path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Houses" },
  dog_kennel:      { id: 6973, canonical: "Dog Kennels & Crates",   path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Kennels & Pens" },
  dog_carrier:     { id: 6980, canonical: "Dog Carriers",           path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Carrier & Travel Products" },
  dog_grooming:    { id: 4993, canonical: "Dog Grooming",           path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Grooming Supplies" },
  dog_apparel:     { id: 5003, canonical: "Dog Clothing",           path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Apparel" },
  dog_training:    { id: 5005, canonical: "Dog Training",           path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Training Aids" },
  dog_waste:       { id: 8069, canonical: "Dog Waste Management",   path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies > Dog Diaper Pads & Liners" },
  dog_safety_gate: { id: 6383, canonical: "Pet Safety Gates",       path: "Animals & Pet Supplies > Pet Supplies > Pet Safety Gates" },
  dog_general:     { id: 3262, canonical: "Dog Supplies",           path: "Animals & Pet Supplies > Pet Supplies > Dog Supplies" },

  // ── Pet (cross-species) ────────────────────────────────────────────
  pet_stroller:    { id: 6978, canonical: "Pet Strollers",          path: "Animals & Pet Supplies > Pet Supplies > Pet Carriers & Crates" },
  pet_carrier:     { id: 6978, canonical: "Pet Carriers",           path: "Animals & Pet Supplies > Pet Supplies > Pet Carriers & Crates" },
  pet_general:     { id: 2,    canonical: "Pet Supplies",           path: "Animals & Pet Supplies > Pet Supplies" },
} as const;

export type GpcKey = keyof typeof GPC_CATALOG;

/** Detect species from text. Returns 'cat' | 'dog' | 'pet'. */
function detectSpecies(text: string): "cat" | "dog" | "pet" {
  const t = text.toLowerCase();
  const hasCat = /\b(cat|cats|kitten|kitty|feline)\b/.test(t);
  const hasDog = /\b(dog|dogs|puppy|puppies|canine)\b/.test(t);
  if (hasCat && !hasDog) return "cat";
  if (hasDog && !hasCat) return "dog";
  if (hasCat && hasDog) return "pet";
  return "pet";
}

/** Build a GpcMatch from a key + detected species. */
function build(key: GpcKey, species: "cat" | "dog" | "pet", confident: boolean): GpcMatch {
  const node = GPC_CATALOG[key];
  return { id: node.id, key, path: node.path, canonical: node.canonical, species, confident };
}

/**
 * Classify a product into the correct Google Product Category.
 * Looks at name + category + description. Sub-category specific
 * rules take priority over generic species fallbacks.
 */
export function classifyGoogleProductCategory(
  name: string,
  category?: string | null,
  description?: string | null,
): GpcMatch {
  const text = `${name || ""} ${category || ""} ${description || ""}`.toLowerCase();
  const species = detectSpecies(`${name || ""} ${category || ""}`);

  // ── Cat sub-categories (most specific first) ──────────────────────
  if (/\b(cat\s*tree|cat\s*tower|cat\s*condo|climbing\s*frame|cat\s*activity\s*center)\b/.test(text))
    return build("cat_tree", "cat", true);

  if (/\b(litter\s*box|litter\s*tray|cat\s*toilet|self[-\s]*cleaning\s*litter)\b/.test(text))
    return build("litter_box", "cat", true);

  if (/\b(litter\s*(scoop|mat|liner|deodorizer|bag))\b/.test(text))
    return build("cat_litter_acc", "cat", true);

  if (/\b(scratching\s*post|cat\s*scratcher|sisal\s*post)\b/.test(text))
    return build("cat_furniture", "cat", true);

  if (/\b(cat\s*(hammock|shelf|perch|window|house|enclosure))\b/.test(text))
    return build("cat_furniture", "cat", true);

  if (/\bcat\b/.test(text) && /\b(bed|cushion|mat|cave|igloo)\b/.test(text))
    return build("cat_bed", "cat", true);

  if (/\bcat\b/.test(text) && /\b(toy|teaser|laser|feather\s*wand|catnip)\b/.test(text))
    return build("cat_toy", "cat", true);

  if (/\bcat\b/.test(text) && /\b(carrier|backpack|travel\s*bag)\b/.test(text))
    return build("cat_carrier", "cat", true);

  if (/\bcat\b/.test(text) && /\b(bowl|feeder|fountain|water\s*dispenser)\b/.test(text))
    return build("cat_bowl", "cat", true);

  if (/\bcat\b/.test(text) && /\b(brush|comb|grooming|nail\s*(clipper|grinder))\b/.test(text))
    return build("cat_grooming", "cat", true);

  if (/\bcat\b/.test(text) && /\b(collar|harness|bandana)\b/.test(text))
    return build("cat_collar", "cat", true);

  // ── Dog sub-categories ────────────────────────────────────────────
  if (/\b(dog\s*(bed|cot|mattress|mat|cushion))\b/.test(text)
      || /\b(orthopedic|memory\s*foam|elevated\s*cooling)\s*(dog\s*)?bed\b/.test(text))
    return build("dog_bed", "dog", true);

  if (/\bdog\b/.test(text) && /\b(toy|ball|squeaky|chew|frisbee|tug)\b/.test(text))
    return build("dog_toy", "dog", true);

  if (/\b(leash|lead|traction\s*rope|dog\s*harness|dog\s*collar)\b/.test(text))
    return build("dog_collar", "dog", true);

  if (/\b(slow\s*feeder|dog\s*bowl|dog\s*feeder|water\s*fountain)\b/.test(text))
    return build("dog_bowl", "dog", true);

  if (/\b(dog\s*house|dog\s*kennel)\b/.test(text))
    return build("dog_house", "dog", true);

  if (/\b(dog\s*crate|kennel|playpen|puppy\s*pen)\b/.test(text))
    return build("dog_kennel", "dog", true);

  if (/\b(dog\s*(carrier|backpack|stroller|travel\s*bag|car\s*seat|booster))\b/.test(text))
    return build("dog_carrier", "dog", true);

  if (/\bdog\b/.test(text) && /\b(brush|comb|grooming|deshed|nail\s*(clipper|grinder)|trimmer|shampoo)\b/.test(text))
    return build("dog_grooming", "dog", true);

  if (/\b(dog\s*(sweater|jacket|coat|raincoat|hoodie|costume|vest|shoes|boots))\b/.test(text)
      || /\bdog\b.+\b(apparel|clothing|bandana)\b/.test(text))
    return build("dog_apparel", "dog", true);

  if (/\b(training\s*pad|puppy\s*pad|clicker|treat\s*pouch|agility)\b/.test(text))
    return build("dog_training", "dog", true);

  if (/\b(poop\s*bag|waste\s*bag|bag\s*dispenser|pooper\s*scooper)\b/.test(text))
    return build("dog_waste", "dog", true);

  if (/\b(safety\s*gate|pet\s*gate|barrier)\b/.test(text))
    return build("dog_safety_gate", "pet", true);

  // ── Cross-species (carriers/strollers without explicit species) ──
  if (/\b(stroller|pet\s*stroller)\b/.test(text))
    return build("pet_stroller", species, true);

  if (/\b(carrier|backpack|travel\s*bag)\b/.test(text))
    return build("pet_carrier", species, true);

  if (/\b(bowl|feeder|fountain)\b/.test(text)) {
    if (species === "cat") return build("cat_bowl", "cat", true);
    if (species === "dog") return build("dog_bowl", "dog", true);
    return build("dog_bowl", "pet", false);
  }

  // ── Species-only fallback ─────────────────────────────────────────
  if (species === "cat") return build("cat_general", "cat", false);
  if (species === "dog") return build("dog_general", "dog", false);

  return build("pet_general", "pet", false);
}

/** Convenience: numeric ID only. */
export function getGoogleProductCategoryId(name: string, category?: string | null, description?: string | null): number {
  return classifyGoogleProductCategory(name, category, description).id;
}

/** Convenience: taxonomy path string. */
export function getGoogleProductCategoryPath(name: string, category?: string | null, description?: string | null): string {
  return classifyGoogleProductCategory(name, category, description).path;
}
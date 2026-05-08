// Client-side mirror of supabase/functions/_shared/pinterest-style-dna.ts → detectNiche.
// Pure string matching, refactored into a rule list so the admin debugging UI
// can show WHICH rule fired (and which rules nearly fired) for any product.
// Keep in sync with the edge function — same rules, same order.

export type NicheKey =
  | "cat_litter"
  | "dog_car"
  | "cat_tree"
  | "dog_harness"
  | "calming_bed"
  | "dog_bed"
  | "cat_fountain"
  | "interactive_toy"
  | "grooming"
  | "feeder"
  | "cat_carrier"
  | "dog_carrier"
  | "dog_collar"
  | "dog_training"
  | "outdoor_house"
  | "bowl_station"
  | "dog_clothing"
  | "treats"
  | "cat_scratcher"
  | "cat_bed"
  | "potty_training"
  | "pet_camera"
  | "dental_care"
  | "generic_pet";

/**
 * Rule shape:
 *  - `primary`: at least one phrase must appear in the haystack (OR group)
 *  - `requireAny` (optional): at least one phrase must also appear (AND gate)
 *  - `forbidAll`  (optional): rule is disqualified if ANY phrase appears
 */
export type NicheRule = {
  id: string;
  niche: NicheKey;
  primary: string[];
  requireAny?: string[];
  forbidAll?: string[];
};

export const NICHE_RULES: NicheRule[] = [
  { id: "dental_care.core", niche: "dental_care", primary: ["toothbrush", "dental", "tooth brush", "oral care", "teeth cleaning"] },
  { id: "pet_camera.core", niche: "pet_camera", primary: ["pet camera", "pet cam", "dog camera", "cat camera", "pet monitor", "pet feeder camera"] },
  { id: "potty_training.pads", niche: "potty_training", primary: ["potty pad", "pee pad", "puppy pad", "potty training", "grass pad", "toilet trainer", "litter mat"] },
  { id: "dog_clothing.outerwear", niche: "dog_clothing", primary: ["raincoat", "rain coat", "dog jacket", "dog coat", "dog sweater", "dog hoodie", "dog clothing", "dog clothes", "dog shirt", "winter coat"] },
  { id: "treats.core", niche: "treats", primary: ["treat", "jerky", "biscuit", "kibble", "supplement", "probiotic", "vitamin", "digestive"] },
  { id: "treats.chew", niche: "treats", primary: ["chew"], forbidAll: ["toy", "chew toy", "chew-resistant", "chew resistant"] },
  { id: "cat_scratcher.core", niche: "cat_scratcher", primary: ["scratcher", "scratching post", "sisal post", "cardboard scratcher"] },
  { id: "dog_carrier.stroller", niche: "dog_carrier", primary: ["stroller", "bike trailer", "pet wagon", "pet carrier"], requireAny: ["dog", "pet"] },
  { id: "cat_carrier.tote", niche: "cat_carrier", primary: ["carrier", "tote"], requireAny: ["cat", "kitten"] },
  { id: "dog_carrier.backpack", niche: "dog_carrier", primary: ["backpack carrier", "sling carrier"] },
  { id: "outdoor_house.core", niche: "outdoor_house", primary: ["kennel", "outdoor house", "dog house", "cat house", "pet enclosure", "outdoor enclosure", "outdoor cat enclosure", "catio", "playpen", "crate", "cage", "gate", "barrier"] },
  { id: "dog_training.gps", niche: "dog_training", primary: ["gps", "tracker", "wireless fence", "shock collar", "training collar", "bark collar", "remote trainer"] },
  { id: "dog_training.agility", niche: "dog_training", primary: ["agility", "training rope", "training tray", "recall"] },
  { id: "dog_collar.core", niche: "dog_collar", primary: ["collar", "leash", "harness leash", "bandana"], requireAny: ["dog", "puppy", "pet"] },
  { id: "dog_clothing.scarf", niche: "dog_clothing", primary: ["scarf"], requireAny: ["dog", "pet"] },
  { id: "bowl_station.core", niche: "bowl_station", primary: ["elevated bowl", "elevated dog bowl", "elevated cat bowl", "elevated pet", "feeding station", "double bowl", "double dish", "stainless bowl", "stainless steel bowl", "ceramic bowl", "raised bowl", "raised stand", "slow feeder bowl", "tilted pet food", "pet food bowl", "dog bowl", "cat bowl", "travel bowl", "water bottle"] },
  { id: "cat_bed.core", niche: "cat_bed", primary: ["cat bed", "kitten bed", "cat cushion", "cat nap"] },
  { id: "potty_training.waste", niche: "potty_training", primary: ["waste bag", "poop bag", "poop scoop", "dog dropper"] },
  { id: "grooming.wipes", niche: "grooming", primary: ["wipes", "hair remover", "hair removal", "lint roller"] },
  { id: "cat_fountain.dog_dispenser", niche: "cat_fountain", primary: ["water dispenser", "water fountain"], requireAny: ["dog", "pet"] },
  { id: "feeder.smart", niche: "feeder", primary: ["automatic feeder", "auto feeder", "smart feeder", "food dispenser", "pet feeder"] },
  { id: "dog_bed.sofa", niche: "dog_bed", primary: ["pet sofa", "dog sofa", "dog couch", "pet bed", "pet napping"] },
  { id: "interactive_toy.chew_toy", niche: "interactive_toy", primary: ["chew toy", "squeaky", "squeak", "rubber toy", "tug toy", "fetch", "tumbler", "teaser", "fish toy", "mouse toy", "teething stick"] },
  { id: "interactive_toy.electronic", niche: "interactive_toy", primary: ["ball launcher", "laser pointer", "electric plush", "mouse turntable", "mouse", "puzzle bowl", "enrichment mat"] },
  { id: "grooming.balm", niche: "grooming", primary: ["paw balm", "waterless", "comb", "trimmer", "goggles", "sunglasses", "eyewear", "body care"] },
  { id: "potty_training.bin", niche: "potty_training", primary: ["poop bag", "poop bin", "poop trash", "waste bin", "litter scoop"] },
  { id: "potty_training.mat", niche: "potty_training", primary: ["poo bag", "poop", "potty mat", "training pad"] },
  { id: "grooming.repellent", niche: "grooming", primary: ["repellent", "deterrent spray", "scratch-proof spray"] },
  { id: "cat_tree.shelf", niche: "cat_tree", primary: ["cat shelf", "cat shelves", "wall mounted cat", "wall-mounted cat", "jumping board"] },
  { id: "dog_clothing.fleece", niche: "dog_clothing", primary: ["dog clothing", "pet clothing", "polyester clothing", "fleece dog", "transformation clothing"] },
  { id: "dog_bed.stairs", niche: "dog_bed", primary: ["pet stairs", "dog stairs", "dog ramp", "pet ramp", "dog steps"] },
  { id: "bowl_station.silicone", niche: "bowl_station", primary: ["silicone pet bowl", "silicone bowl", "ceramic pet bowl", "tilted pet"] },
  { id: "cat_litter.smart", niche: "cat_litter", primary: ["litter box", "litter-box", "litter"], requireAny: ["cat", "kitten"], /* additionally requires auto/self/smart, modeled via second require */ },
  // Note: rule above intentionally promotes any litter+cat to cat_litter via the
  // looser fallback below (matches original behavior — first match wins).
  { id: "cat_litter.any", niche: "cat_litter", primary: ["litter"], requireAny: ["cat"] },
  { id: "dog_car.seat", niche: "dog_car", primary: ["car seat", "seat cover", "car cover", "trunk cover", "back seat", "car bed"], requireAny: ["dog", "pet"] },
  { id: "dog_car.vehicle", niche: "dog_car", primary: ["car ", " car", "vehicle", "suv"], requireAny: ["dog", "pet"] },
  { id: "cat_tree.tower", niche: "cat_tree", primary: ["cat tree", "cat tower", "cat condo", "scratch tower", "climbing tree"] },
  { id: "dog_harness.core", niche: "dog_harness", primary: ["harness"], requireAny: ["dog", "puppy"] },
  { id: "dog_harness.hike", niche: "dog_harness", primary: ["hike", "hiking", "trail"], requireAny: ["dog"] },
  { id: "calming_bed.named", niche: "calming_bed", primary: ["calming bed", "anxiety bed", "donut bed", "faux fur bed", "marshmallow bed"] },
  { id: "calming_bed.bed", niche: "calming_bed", primary: ["calming", "anxiety"], requireAny: ["bed"] },
  { id: "dog_bed.ortho", niche: "dog_bed", primary: ["orthopedic", "memory foam"], requireAny: ["bed"] },
  { id: "dog_bed.named", niche: "dog_bed", primary: ["dog bed"] },
  { id: "cat_fountain.core", niche: "cat_fountain", primary: ["fountain", "water dispenser"], requireAny: ["cat", "pet"] },
  { id: "feeder.named", niche: "feeder", primary: ["automatic feeder", "smart feeder", "auto feeder", "pet feeder"] },
  { id: "grooming.brush", niche: "grooming", primary: ["brush", "deshedding", "grooming glove", "nail grinder", "clipper"] },
  { id: "interactive_toy.puzzle", niche: "interactive_toy", primary: ["interactive", "puzzle toy", "treat dispenser", "automatic toy", "laser toy"] },
];

export interface DetectionTrace {
  haystack: string;
  niche: NicheKey;
  matchedRule: { id: string; niche: NicheKey; matchedPrimary: string[]; matchedRequire: string[] } | null;
  nearMisses: Array<{
    id: string;
    niche: NicheKey;
    matchedPrimary: string[];
    missingRequire?: string[];
    blockedByForbid?: string[];
    requireMatched?: string[];
    missingPrimary?: boolean;
  }>;
}

function buildHaystack(input: {
  name?: string | null;
  slug?: string | null;
  category?: string | null;
  product_type?: string | null;
}): string {
  return [input.name, input.slug, input.category, input.product_type]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function hits(hay: string, words: string[]): string[] {
  return words.filter((w) => hay.includes(w));
}

export function detectNiche(input: {
  name?: string | null;
  slug?: string | null;
  category?: string | null;
  product_type?: string | null;
}): NicheKey {
  return explainNiche(input).niche;
}

export function explainNiche(input: {
  name?: string | null;
  slug?: string | null;
  category?: string | null;
  product_type?: string | null;
}): DetectionTrace {
  const hay = buildHaystack(input);
  const nearMisses: DetectionTrace["nearMisses"] = [];

  for (const rule of NICHE_RULES) {
    const matchedPrimary = hits(hay, rule.primary);
    const matchedForbid = rule.forbidAll ? hits(hay, rule.forbidAll) : [];
    const matchedRequire = rule.requireAny ? hits(hay, rule.requireAny) : [];
    const requireOk = !rule.requireAny || matchedRequire.length > 0;
    const forbidOk = !rule.forbidAll || matchedForbid.length === 0;

    if (matchedPrimary.length > 0 && requireOk && forbidOk) {
      return {
        haystack: hay,
        niche: rule.niche,
        matchedRule: { id: rule.id, niche: rule.niche, matchedPrimary, matchedRequire },
        nearMisses,
      };
    }

    // Capture near-miss rules: primary matched but require/forbid blocked,
    // OR require matched but primary missing.
    if (matchedPrimary.length > 0 && (!requireOk || !forbidOk)) {
      nearMisses.push({
        id: rule.id,
        niche: rule.niche,
        matchedPrimary,
        ...(rule.requireAny && !requireOk ? { missingRequire: rule.requireAny } : {}),
        ...(matchedForbid.length > 0 ? { blockedByForbid: matchedForbid } : {}),
      });
    } else if (matchedPrimary.length === 0 && matchedRequire.length > 0) {
      nearMisses.push({
        id: rule.id,
        niche: rule.niche,
        matchedPrimary: [],
        requireMatched: matchedRequire,
        missingPrimary: true,
      });
    }
  }

  return {
    haystack: hay,
    niche: "generic_pet",
    matchedRule: null,
    nearMisses,
  };
}
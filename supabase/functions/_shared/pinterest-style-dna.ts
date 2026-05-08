// ─────────────────────────────────────────────────────────────────────────────
// Pinterest Creative Director — Niche Style DNA
// ─────────────────────────────────────────────────────────────────────────────
// Maps a product (name + slug + category) → a "creative profile" that drives
// AI scene generation. Each niche has a distinct environment, lighting, mood,
// typography, and emotional hook bank so the resulting Pinterest pin looks
// like a high-budget DTC ad — not a generic template.
//
// Used by `pinterest-creative-director` to produce scene briefs that the AI
// image model renders as fully composed lifestyle photographs.

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

export interface StyleDNA {
  niche_key: NicheKey;
  label: string;
  /** Short scene direction injected into every image prompt for this niche. */
  environment: string;
  light: string;
  mood: string;
  /** "serif elegant" | "serif bold" | "condensed sans" | "soft serif" */
  typography: "serif elegant" | "serif bold" | "serif refined" | "condensed sans" | "serif soft";
  /** Hook angles for headline brainstorming. */
  hook_bank: string[];
  /** Words that must NEVER appear (compliance + brand). */
  banned_terms: string[];
  /** Subjects that should appear in the scene (pet/breed/use). */
  subjects: string[];
  /** Composition presets the brief generator can pick from. */
  compositions: string[];
  /** CTA candidates (≤18 chars). */
  cta_bank: string[];
}

const BANNED_BASE = [
  "vet-approved",
  "vet approved",
  "eco-friendly",
  "dropshipping",
  "best price",
  "lowest price",
  "cheapest",
  "guaranteed",
  "miracle",
];

export const STYLE_DNA: Record<NicheKey, StyleDNA> = {
  cat_litter: {
    niche_key: "cat_litter",
    label: "Automatic / Self-cleaning Cat Litter",
    environment:
      "cozy modern US apartment, neutral palette (cream, oat, warm white), wood floors, linen textures, soft houseplants, minimal styled corner of a bathroom or laundry nook",
    light: "warm late-afternoon window light, gentle directional shadows",
    mood: "calm, relieved, hands-free, modern cat-parent lifestyle",
    typography: "serif elegant",
    hook_bank: [
      "no more scooping",
      "odor sealed automatically",
      "your weekend back",
      "a litter box you forget exists",
      "self-cleans while you sleep",
    ],
    banned_terms: BANNED_BASE,
    subjects: [
      "calm short-haired tabby or grey cat near a sleek automatic litter box",
      "owner relaxing nearby with coffee, not actively cleaning",
    ],
    compositions: [
      "wide editorial shot of styled corner with the litter unit naturally placed",
      "low-angle lifestyle shot, cat walking past with morning light",
      "over-the-shoulder of owner enjoying coffee while the unit sits in soft focus",
    ],
    cta_bank: ["See it work", "Shop now", "Why owners switch", "Learn more"],
  },

  dog_car: {
    niche_key: "dog_car",
    label: "Dog Car Seat Cover / Travel Gear",
    environment:
      "SUV interior on an open American highway, scenic road or coastal overlook visible through windows, tan leather and warm fabrics",
    light: "golden hour, warm sun raking across the back seat",
    mood: "adventure, family, freedom, road-trip",
    typography: "serif bold",
    hook_bank: [
      "road trips, zero mess",
      "every drive, protected",
      "his happy place on every trip",
      "from couch to coast",
    ],
    banned_terms: BANNED_BASE,
    subjects: [
      "happy labrador or golden retriever resting on the protected back seat",
      "owner loading a packed SUV at a trailhead, dog sitting calmly inside",
    ],
    compositions: [
      "rear-cabin editorial, golden light through the back window",
      "open tailgate at sunset with dog sitting on covered seat",
      "muddy paws moment captured cleanly on the cover, soft focus",
    ],
    cta_bank: ["Shop the cover", "Protect your seats", "See the fit"],
  },

  cat_tree: {
    niche_key: "cat_tree",
    label: "Cat Tree / Cat Furniture",
    environment:
      "Scandinavian living room, white oak floors, linen sofa, large monstera or olive tree, soft neutral rug, plenty of negative space",
    light: "bright diffused daylight from a tall window",
    mood: "aesthetic home decor, playful, calm luxury",
    typography: "serif refined",
    hook_bank: [
      "furniture your cat actually loves",
      "the climbing tower that looks like decor",
      "designed for happy cats and stylish homes",
    ],
    banned_terms: BANNED_BASE,
    subjects: [
      "elegant cat (russian blue, ragdoll, or tabby) perched on a modern cat tree",
      "two cats playing on different levels of a tall cat tree",
    ],
    compositions: [
      "wide interiors-magazine framing with the tree as a focal element",
      "cat-eye-level shot looking up the tree against soft window light",
    ],
    cta_bank: ["Shop the tree", "See heights", "Build your cat's space"],
  },

  dog_harness: {
    niche_key: "dog_harness",
    label: "Dog Harness / Outdoor Gear",
    environment:
      "mountain trail, alpine forest, or coastal cliff path with US national-park energy, dappled light through pines",
    light: "crisp morning light, long shadows, slight mist",
    mood: "active, energetic, adventurous, outdoor lifestyle",
    typography: "condensed sans",
    hook_bank: [
      "built for the trail",
      "no-pull, all-day comfort",
      "your trail partner deserves better",
    ],
    banned_terms: BANNED_BASE,
    subjects: [
      "athletic dog (husky, australian shepherd, vizsla) wearing a fitted harness on a trail",
      "owner and dog hiking together, harness clearly visible in motion",
    ],
    compositions: [
      "low-angle action shot of the dog mid-stride",
      "wide landscape with hiker + dog as small silhouettes",
      "close detail of the harness on the dog with trail blurred behind",
    ],
    cta_bank: ["Shop the harness", "Gear up", "Hit the trail"],
  },

  calming_bed: {
    niche_key: "calming_bed",
    label: "Calming / Anxiety Pet Bed",
    environment:
      "dim cozy bedroom corner, layered blankets, knit throw, side lamp, candle, soft cream and oat tones",
    light: "warm candlelit + low lamp glow, cinematic chiaroscuro",
    mood: "sleepy, safe, comforting, emotional warmth",
    typography: "serif soft",
    hook_bank: [
      "the deepest sleep she's ever had",
      "anxiety-calming, vet-loved comfort",
      "she finally lets go",
      "her safe place",
    ],
    banned_terms: BANNED_BASE.filter((t) => t !== "vet-approved"), // 'vet-loved' is fine; still ban 'vet-approved'
    subjects: [
      "small to medium dog or cat curled deep into a faux-fur calming bed",
      "puppy half-asleep, paws tucked, eyes drifting closed",
    ],
    compositions: [
      "tight intimate framing of the pet sinking into the bed",
      "wide cozy-corner shot with bed as the warm anchor of the scene",
    ],
    cta_bank: ["Shop the bed", "See sizes", "Help her sleep"],
  },

  dog_bed: {
    niche_key: "dog_bed",
    label: "Dog Bed / Orthopedic",
    environment:
      "warm living room, hardwood floors, woven rug, neutral sofa, throw blanket — relaxed weekend vibe",
    light: "soft afternoon window light",
    mood: "restful, dependable, loved-companion",
    typography: "serif elegant",
    hook_bank: [
      "joint relief he can feel",
      "his spot, finally his",
      "orthopedic support, all-day comfort",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["older labrador or large breed lying on an orthopedic bed, relaxed and content"],
    compositions: [
      "wide living-room editorial with bed in natural placement",
      "eye-level intimate shot of the dog on the bed",
    ],
    cta_bank: ["Shop the bed", "See sizes", "Better sleep"],
  },

  cat_fountain: {
    niche_key: "cat_fountain",
    label: "Cat Water Fountain",
    environment:
      "clean kitchen corner or styled feeding station, marble or oak counter, plants, neutral ceramics",
    light: "bright soft daylight, gentle reflections on water",
    mood: "fresh, hydrating, clean lifestyle",
    typography: "serif refined",
    hook_bank: [
      "fresher water, every sip",
      "the fountain cats actually drink from",
      "hydration, on tap",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["curious cat sipping from a modern ceramic-look fountain"],
    compositions: [
      "side profile of cat drinking with water motion frozen mid-stream",
      "wide kitchen-corner shot with fountain as feature",
    ],
    cta_bank: ["Shop the fountain", "See it flow", "Keep them drinking"],
  },

  interactive_toy: {
    niche_key: "interactive_toy",
    label: "Interactive Pet Toy",
    environment: "bright playful living room, rug, soft toys, sun-filled space",
    light: "happy daylight, bouncy energy",
    mood: "playful, joyful, engaged",
    typography: "serif bold",
    hook_bank: [
      "boredom, solved",
      "the toy that runs itself",
      "tires them out, every time",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["pet mid-play, paws in motion, eyes locked on the toy"],
    compositions: ["mid-action freeze frame", "wide playful-room scene"],
    cta_bank: ["Shop the toy", "See it move", "Play more"],
  },

  grooming: {
    niche_key: "grooming",
    label: "Grooming Tools",
    environment: "bright bathroom or styled grooming nook, neutral towels, soft tile",
    light: "clean window light",
    mood: "fresh, cared-for, easy",
    typography: "serif elegant",
    hook_bank: [
      "shed-free in minutes",
      "salon results at home",
      "the brush they actually enjoy",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["calm pet being gently groomed by owner's hands (hands only, in frame)"],
    compositions: ["close hands-and-pet detail", "wide bathroom scene"],
    cta_bank: ["Shop the brush", "See results", "Less shedding"],
  },

  feeder: {
    niche_key: "feeder",
    label: "Automatic Feeder",
    environment: "clean kitchen feeding station, oak or marble surfaces, neutral ceramics",
    light: "morning daylight",
    mood: "reliable, smart-home, easy",
    typography: "serif refined",
    hook_bank: [
      "feeds them on time, every time",
      "your mornings, back",
      "smart feeding, zero stress",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["pet waiting calmly near a modern automatic feeder"],
    compositions: ["styled kitchen feeding-station scene", "pet eye-level with feeder"],
    cta_bank: ["Shop the feeder", "See schedule", "Feed smarter"],
  },

  generic_pet: {
    niche_key: "generic_pet",
    label: "Generic Pet Lifestyle",
    environment: "warm US home interior, natural materials, neutral palette",
    light: "soft natural daylight",
    mood: "wholesome, trustworthy, premium",
    typography: "serif elegant",
    hook_bank: [
      "made for the pets we love",
      "small upgrade, big difference",
      "the everyday essential",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["happy, well-cared-for pet in a styled home setting"],
    compositions: ["editorial wide shot", "intimate eye-level lifestyle"],
    cta_bank: ["Shop now", "See it", "Learn more"],
  },
};

/** Heuristic niche detection from product name + slug + category. */
export function detectNiche(input: {
  name?: string | null;
  slug?: string | null;
  category?: string | null;
  product_type?: string | null;
}): NicheKey {
  const hay = [input.name, input.slug, input.category, input.product_type]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const has = (...words: string[]) => words.some((w) => hay.includes(w));

  if (has("litter box", "litter-box", "litter") && has("cat", "kitten") && has("auto", "self", "smart"))
    return "cat_litter";
  if (has("litter") && has("cat")) return "cat_litter";

  if (has("car seat", "seat cover", "car cover", "trunk cover", "back seat", "car bed") && has("dog", "pet"))
    return "dog_car";
  if (has("car ", " car", "vehicle", "suv") && has("dog", "pet")) return "dog_car";

  if (has("cat tree", "cat tower", "cat condo", "scratch tower", "climbing tree")) return "cat_tree";

  if (has("harness") && has("dog", "puppy")) return "dog_harness";
  if (has("hike", "hiking", "trail") && has("dog")) return "dog_harness";

  if (has("calming bed", "anxiety bed", "donut bed", "faux fur bed", "marshmallow bed")) return "calming_bed";
  if (has("calming", "anxiety") && has("bed")) return "calming_bed";

  if (has("orthopedic", "memory foam") && has("bed")) return "dog_bed";
  if (has("dog bed")) return "dog_bed";

  if (has("fountain", "water dispenser") && has("cat", "pet")) return "cat_fountain";

  if (has("automatic feeder", "smart feeder", "auto feeder", "pet feeder")) return "feeder";

  if (has("brush", "deshedding", "grooming glove", "nail grinder", "clipper")) return "grooming";

  if (has("interactive", "puzzle toy", "treat dispenser", "automatic toy", "laser toy"))
    return "interactive_toy";

  return "generic_pet";
}

export function getStyleDNA(niche: NicheKey): StyleDNA {
  return STYLE_DNA[niche] ?? STYLE_DNA.generic_pet;
}
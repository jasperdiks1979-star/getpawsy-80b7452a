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

  cat_carrier: {
    niche_key: "cat_carrier",
    label: "Cat Carrier / Travel",
    environment:
      "soft-lit US apartment entryway or sunny car interior, neutral linens, tote-style carrier on a styled bench",
    light: "warm soft daylight, gentle shadows",
    mood: "calm, safe, travel-ready, bonded",
    typography: "serif refined",
    hook_bank: [
      "stress-free trips, every time",
      "the carrier she actually walks into",
      "vet visits, finally easy",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["calm cat sitting inside a modern soft-sided carrier, curious gaze"],
    compositions: ["entryway editorial with carrier on bench", "passenger-seat shot, soft window light"],
    cta_bank: ["Shop the carrier", "See sizes", "Travel ready"],
  },

  dog_carrier: {
    niche_key: "dog_carrier",
    label: "Dog Stroller / Bike Trailer / Carrier",
    environment:
      "tree-lined US suburban sidewalk or park path, soft greenery, warm pavement, golden afternoon light",
    light: "warm late-afternoon sun, dappled tree light",
    mood: "active, gentle, joyful outing",
    typography: "serif bold",
    hook_bank: [
      "every walk, his ride",
      "small dog, big adventures",
      "the smoothest ride in the park",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["happy small dog sitting up in a stroller or bike trailer on a park path"],
    compositions: ["wide park-path shot, owner pushing stroller", "low-angle action with motion blur on the path"],
    cta_bank: ["Shop the stroller", "See it roll", "Take them along"],
  },

  dog_collar: {
    niche_key: "dog_collar",
    label: "Dog Collar / Leash / GPS",
    environment:
      "neighborhood walk at golden hour, leafy sidewalk, warm brick, gentle bokeh; or open trail with soft grass",
    light: "golden hour, low warm sun behind",
    mood: "confident, in-control, daily-walk love",
    typography: "condensed sans",
    hook_bank: [
      "the walk, upgraded",
      "always knows where he is",
      "comfort that lasts every mile",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["mid-size dog walking on leash, collar clearly visible at neckline"],
    compositions: ["close detail of collar with dog blurred behind", "wide walking shot at golden hour"],
    cta_bank: ["Shop the collar", "See colors", "Walk smarter"],
  },

  dog_training: {
    niche_key: "dog_training",
    label: "Dog Training / Containment",
    environment: "open backyard with green lawn, picket fence, soft morning light, US suburban setting",
    light: "fresh morning light, dewy grass",
    mood: "calm authority, well-behaved companion",
    typography: "condensed sans",
    hook_bank: [
      "calmer walks, better days",
      "the routine that finally clicks",
      "freedom for him, peace for you",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["focused dog responding to a calm owner in a backyard scene"],
    compositions: ["wide backyard editorial", "intimate eye-contact moment between owner and dog"],
    cta_bank: ["Shop training", "See how", "Train calmly"],
  },

  outdoor_house: {
    niche_key: "outdoor_house",
    label: "Outdoor Pet House / Kennel / Enclosure",
    environment: "shaded backyard, natural wood deck, soft greenery, cedar fence, warm late-day light",
    light: "warm dappled afternoon light through trees",
    mood: "secure, sheltered, weather-ready",
    typography: "serif bold",
    hook_bank: [
      "his own place outside",
      "weatherproof, year-round",
      "the backyard upgrade he deserves",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["dog or cat resting inside a wooden outdoor house in a styled backyard"],
    compositions: ["wide backyard editorial with house as anchor", "intimate doorway shot of pet looking out"],
    cta_bank: ["Shop the house", "See sizes", "Build outside"],
  },

  bowl_station: {
    niche_key: "bowl_station",
    label: "Bowl / Manual Feeding Station",
    environment: "clean kitchen corner, oak floors, neutral ceramics, plant, styled feeding nook",
    light: "soft morning daylight",
    mood: "tidy, daily-routine, quietly premium",
    typography: "serif refined",
    hook_bank: [
      "mealtime, finally tidy",
      "the feeding station that fits the kitchen",
      "every meal, in its place",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["pet eating from an elevated bowl in a styled kitchen corner"],
    compositions: ["styled kitchen-corner editorial", "top-down on bowls with neutral floor"],
    cta_bank: ["Shop the bowls", "See sizes", "Feed in style"],
  },

  dog_clothing: {
    niche_key: "dog_clothing",
    label: "Dog Clothing / Jacket / Raincoat",
    environment: "rainy city sidewalk or autumn park path, wet leaves, warm street lamps, moody weather",
    light: "soft overcast or rain-light, glistening surfaces",
    mood: "stylish, weather-ready, cozy",
    typography: "serif elegant",
    hook_bank: [
      "rain or shine, ready",
      "a coat he actually wears",
      "warm, dry, walking",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["small or mid dog wearing a fitted jacket or raincoat on a wet sidewalk"],
    compositions: ["wide rainy-street editorial", "low-angle of dog mid-walk in coat"],
    cta_bank: ["Shop the coat", "See sizes", "Stay dry"],
  },

  treats: {
    niche_key: "treats",
    label: "Treats / Food",
    environment: "neutral kitchen styled flatlay or cozy living-room corner, light wood, linen napkin",
    light: "bright soft daylight",
    mood: "wholesome, premium, treat-time joy",
    typography: "serif elegant",
    hook_bank: [
      "the treat they earn first",
      "small bites, big tail wags",
      "treat time, upgraded",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["pet eagerly waiting for a treat from owner's hand (hands only)"],
    compositions: ["styled flatlay with treats and bowl", "intimate hand-and-pet treat moment"],
    cta_bank: ["Shop treats", "See flavors", "Treat them"],
  },

  cat_scratcher: {
    niche_key: "cat_scratcher",
    label: "Cat Scratcher / Post",
    environment: "Scandinavian living room corner, oak floor, linen throw, monstera plant, warm window light",
    light: "bright diffused window daylight",
    mood: "calm decor, nail-care made beautiful",
    typography: "serif refined",
    hook_bank: [
      "the scratcher she chooses over the couch",
      "design-forward nail care",
      "save the sofa, finally",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["cat mid-stretch on a sisal scratching post in a styled living-room corner"],
    compositions: ["wide interiors-magazine framing", "side-profile of cat scratching with motion in claws"],
    cta_bank: ["Shop the scratcher", "See styles", "Save the couch"],
  },

  cat_bed: {
    niche_key: "cat_bed",
    label: "Cat Bed",
    environment: "sunlit window nook with linen curtain, oak floor, knit throw, warm cream palette",
    light: "soft sunbeam falling on the bed",
    mood: "cozy, sun-warmed, deeply restful",
    typography: "serif soft",
    hook_bank: [
      "her favorite sunbeam, upgraded",
      "the nap spot she'll claim instantly",
      "cozy, every afternoon",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["cat curled in a soft round bed in a sunlit window nook"],
    compositions: ["wide window-nook editorial", "tight intimate framing of cat in bed"],
    cta_bank: ["Shop the bed", "See sizes", "Nap upgrade"],
  },

  potty_training: {
    niche_key: "potty_training",
    label: "Potty / Toilet Training Pad",
    environment: "clean modern entryway or balcony with grass pad, neutral tile, plant nearby",
    light: "bright clean daylight",
    mood: "practical, fresh, apartment-friendly",
    typography: "condensed sans",
    hook_bank: [
      "indoor potty, finally solved",
      "balcony-ready, mess-free",
      "the apartment dog upgrade",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["small dog standing on a tidy artificial-grass pad in a clean entryway or balcony"],
    compositions: ["wide entryway editorial", "top-down on the pad with the dog walking onto it"],
    cta_bank: ["Shop the pad", "See it", "Train indoors"],
  },

  pet_camera: {
    niche_key: "pet_camera",
    label: "Pet Camera / Smart Monitor",
    environment: "modern living room shelf or kitchen counter, smart-home aesthetic, soft daylight",
    light: "clean diffused daylight",
    mood: "connected, reassuring, smart-home calm",
    typography: "condensed sans",
    hook_bank: [
      "see them anywhere",
      "home, always with you",
      "peace of mind, on tap",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["pet napping in soft focus while a small modern camera sits sharply in foreground"],
    compositions: ["styled shelf with camera in foreground, pet behind", "phone-in-hand mockup viewing the camera feed"],
    cta_bank: ["Shop the cam", "See features", "Watch live"],
  },

  dental_care: {
    niche_key: "dental_care",
    label: "Dental / Toothbrush / Oral Care",
    environment: "clean bathroom counter or styled grooming nook, neutral tile, soft towel",
    light: "bright clean window light",
    mood: "fresh, healthy, daily-routine",
    typography: "serif elegant",
    hook_bank: [
      "fresher breath, fewer vet bills",
      "the daily routine they tolerate",
      "clean teeth, happy mouth",
    ],
    banned_terms: BANNED_BASE,
    subjects: ["calm dog or cat being gently brushed by owner's hands (hands only)"],
    compositions: ["close hands-and-pet detail", "styled bathroom-counter scene with the brush"],
    cta_bank: ["Shop dental", "See it work", "Brush easy"],
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

  // ── Specific / high-priority signals first ────────────────────────────────
  if (has("toothbrush", "dental", "tooth brush", "oral care", "teeth cleaning"))
    return "dental_care";

  if (has("pet camera", "pet cam", "dog camera", "cat camera", "pet monitor", "pet feeder camera"))
    return "pet_camera";

  if (has("potty pad", "pee pad", "puppy pad", "potty training", "grass pad", "toilet trainer", "litter mat"))
    return "potty_training";

  if (has("raincoat", "rain coat", "dog jacket", "dog coat", "dog sweater", "dog hoodie", "dog clothing", "dog clothes", "dog shirt", "winter coat") )
    return "dog_clothing";

  if (has("treat", "jerky", "biscuit", "kibble", "supplement", "probiotic", "vitamin") && !has("dispenser", "puzzle", "feeder", "toy"))
    return "treats";
  if (has("chew") && !has("toy", "chew toy", "chew-resistant", "chew resistant")) return "treats";

  if (has("scratcher", "scratching post", "sisal post", "cardboard scratcher")) return "cat_scratcher";

  if (has("stroller", "bike trailer", "pet wagon", "pet carrier") && has("dog", "pet")) return "dog_carrier";
  if (has("carrier", "tote") && has("cat", "kitten")) return "cat_carrier";
  if (has("backpack carrier", "sling carrier")) return "dog_carrier";

  if (has("kennel", "outdoor house", "dog house", "cat house", "pet enclosure", "outdoor enclosure", "outdoor cat enclosure", "catio", "playpen", "crate", "cage", "gate", "barrier") )
    return "outdoor_house";

  if (has("gps", "tracker", "wireless fence", "shock collar", "training collar", "bark collar", "remote trainer") )
    return "dog_training";
  if (has("agility", "training rope", "training tray", "recall")) return "dog_training";

  if (has("collar", "leash", "harness leash", "bandana") && has("dog", "puppy", "pet"))
    return "dog_collar";
  if (has("scarf") && has("dog", "pet")) return "dog_clothing";

  if (has("elevated bowl", "elevated dog bowl", "elevated cat bowl", "elevated pet", "feeding station", "double bowl", "double dish", "stainless bowl", "stainless steel bowl", "ceramic bowl", "raised bowl", "raised stand", "slow feeder bowl", "tilted pet food", "pet food bowl", "dog bowl", "cat bowl", "travel bowl", "water bottle") )
    return "bowl_station";

  if (has("cat bed", "kitten bed", "cat cushion", "cat nap")) return "cat_bed";

  if (has("waste bag", "poop bag", "poop scoop", "dog dropper")) return "potty_training";

  if (has("wipes", "hair remover", "hair removal", "lint roller")) return "grooming";

  if (has("water dispenser", "water fountain") && has("dog", "pet")) return "cat_fountain"; // shared fountain niche
  if (has("automatic feeder", "auto feeder", "smart feeder", "food dispenser", "pet feeder")) return "feeder";

  if (has("pet sofa", "dog sofa", "dog couch", "pet bed", "pet napping")) return "dog_bed";

  if (has("chew toy", "squeaky", "squeak", "rubber toy", "tug toy", "fetch", "tumbler", "teaser", "fish toy", "mouse toy", "teething stick"))
    return "interactive_toy";
  if (has("ball launcher", "laser pointer", "electric plush", "mouse turntable", "mouse", "puzzle bowl", "enrichment mat"))
    return "interactive_toy";

  if (has("paw balm", "waterless", "comb", "trimmer", "goggles", "sunglasses", "eyewear", "body care"))
    return "grooming";

  if (has("poop bag", "poop bin", "poop trash", "waste bin", "litter scoop")) return "potty_training";

  if (has("cat shelf", "cat shelves", "wall mounted cat", "wall-mounted cat", "jumping board")) return "cat_tree";

  if (has("dog clothing", "pet clothing", "polyester clothing", "fleece dog", "transformation clothing"))
    return "dog_clothing";

  if (has("pet stairs", "dog stairs", "dog ramp", "pet ramp", "dog steps")) return "dog_bed";

  if (has("silicone pet bowl", "silicone bowl", "ceramic pet bowl", "tilted pet")) return "bowl_station";

  // ── Existing rules (unchanged behavior) ───────────────────────────────────
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
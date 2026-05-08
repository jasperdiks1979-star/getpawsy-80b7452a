// Client-side mirror of supabase/functions/_shared/pinterest-style-dna.ts → detectNiche.
// Pure string matching — keep in sync with the edge function so the admin
// "generic_pet review" page reflects what the Creative Director actually sees.

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

  if (has("toothbrush", "dental", "tooth brush", "oral care", "teeth cleaning")) return "dental_care";
  if (has("pet camera", "pet cam", "dog camera", "cat camera", "pet monitor", "pet feeder camera")) return "pet_camera";
  if (has("potty pad", "pee pad", "puppy pad", "potty training", "grass pad", "toilet trainer", "litter mat")) return "potty_training";
  if (has("raincoat", "rain coat", "dog jacket", "dog coat", "dog sweater", "dog hoodie", "dog clothing", "dog clothes", "dog shirt", "winter coat")) return "dog_clothing";
  if (has("treat", "jerky", "biscuit", "kibble", "supplement", "probiotic", "vitamin", "digestive")) return "treats";
  if (has("chew") && !has("toy", "chew toy", "chew-resistant", "chew resistant")) return "treats";
  if (has("scratcher", "scratching post", "sisal post", "cardboard scratcher")) return "cat_scratcher";
  if (has("stroller", "bike trailer", "pet wagon", "pet carrier") && has("dog", "pet")) return "dog_carrier";
  if (has("carrier", "tote") && has("cat", "kitten")) return "cat_carrier";
  if (has("backpack carrier", "sling carrier")) return "dog_carrier";
  if (has("kennel", "outdoor house", "dog house", "cat house", "pet enclosure", "outdoor enclosure", "outdoor cat enclosure", "catio", "playpen", "crate", "cage", "gate", "barrier")) return "outdoor_house";
  if (has("gps", "tracker", "wireless fence", "shock collar", "training collar", "bark collar", "remote trainer")) return "dog_training";
  if (has("agility", "training rope", "training tray", "recall")) return "dog_training";
  if (has("collar", "leash", "harness leash", "bandana") && has("dog", "puppy", "pet")) return "dog_collar";
  if (has("scarf") && has("dog", "pet")) return "dog_clothing";
  if (has("elevated bowl", "elevated dog bowl", "elevated cat bowl", "elevated pet", "feeding station", "double bowl", "double dish", "stainless bowl", "stainless steel bowl", "ceramic bowl", "raised bowl", "raised stand", "slow feeder bowl", "tilted pet food", "pet food bowl", "dog bowl", "cat bowl", "travel bowl", "water bottle")) return "bowl_station";
  if (has("cat bed", "kitten bed", "cat cushion", "cat nap")) return "cat_bed";
  if (has("waste bag", "poop bag", "poop scoop", "dog dropper")) return "potty_training";
  if (has("wipes", "hair remover", "hair removal", "lint roller")) return "grooming";
  if (has("water dispenser", "water fountain") && has("dog", "pet")) return "cat_fountain";
  if (has("automatic feeder", "auto feeder", "smart feeder", "food dispenser", "pet feeder")) return "feeder";
  if (has("pet sofa", "dog sofa", "dog couch", "pet bed", "pet napping")) return "dog_bed";
  if (has("chew toy", "squeaky", "squeak", "rubber toy", "tug toy", "fetch", "tumbler", "teaser", "fish toy", "mouse toy", "teething stick")) return "interactive_toy";
  if (has("ball launcher", "laser pointer", "electric plush", "mouse turntable", "mouse", "puzzle bowl", "enrichment mat")) return "interactive_toy";
  if (has("paw balm", "waterless", "comb", "trimmer", "goggles", "sunglasses", "eyewear", "body care")) return "grooming";
  if (has("poop bag", "poop bin", "poop trash", "waste bin", "litter scoop")) return "potty_training";
  if (has("poo bag", "poop", "potty mat", "training pad")) return "potty_training";
  if (has("repellent", "deterrent spray", "scratch-proof spray")) return "grooming";
  if (has("cat shelf", "cat shelves", "wall mounted cat", "wall-mounted cat", "jumping board")) return "cat_tree";
  if (has("dog clothing", "pet clothing", "polyester clothing", "fleece dog", "transformation clothing")) return "dog_clothing";
  if (has("pet stairs", "dog stairs", "dog ramp", "pet ramp", "dog steps")) return "dog_bed";
  if (has("silicone pet bowl", "silicone bowl", "ceramic pet bowl", "tilted pet")) return "bowl_station";

  if (has("litter box", "litter-box", "litter") && has("cat", "kitten") && has("auto", "self", "smart")) return "cat_litter";
  if (has("litter") && has("cat")) return "cat_litter";
  if (has("car seat", "seat cover", "car cover", "trunk cover", "back seat", "car bed") && has("dog", "pet")) return "dog_car";
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
  if (has("interactive", "puzzle toy", "treat dispenser", "automatic toy", "laser toy")) return "interactive_toy";

  return "generic_pet";
}
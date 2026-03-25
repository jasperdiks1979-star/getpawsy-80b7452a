/**
 * Pet Product Filter — Centralized non-pet exclusion logic
 * 
 * Used by: prerender plugin, sitemap generator, merchant feed, homepage features
 * Only dogs and cats are supported. All other animals are excluded.
 */

/** Patterns that indicate a product is NOT a cat/dog product */
const NON_PET_PATTERNS: RegExp[] = [
  // Birds
  /\b(bird|parrot|parakeet|cockatiel|canary|finch|budgie|macaw|aviary|bird\s*cage|bird\s*feeder|bird\s*toy|bird\s*perch|bird\s*swing|bird\s*bath|bird\s*seed)\b/i,
  // Reptiles
  /\b(reptile|snake|lizard|gecko|iguana|turtle|tortoise|terrarium|vivarium|heat\s*lamp|uvb\s*light|reptile\s*tank)\b/i,
  // Chickens / Poultry
  /\b(chicken|poultry|hen|rooster|coop|chicken\s*coop|egg\s*incubator|nesting\s*box|poultry\s*feeder)\b/i,
  // Hamsters / Small rodents
  /\b(hamster|gerbil|guinea\s*pig|chinchilla|ferret|mouse\s*cage|rat\s*cage|rodent|small\s*animal\s*cage|exercise\s*wheel|hamster\s*wheel|hamster\s*cage)\b/i,
  // Fish / Aquarium
  /\b(fish\s*tank|aquarium|fish\s*food|fish\s*bowl|betta|goldfish|tropical\s*fish|aquatic|reef|coral|filter\s*media|air\s*pump|aquarium\s*light)\b/i,
  // Rabbits (when explicitly rabbit-only, not multi-pet)
  /\b(rabbit\s*hutch|rabbit\s*cage|bunny\s*cage|rabbit\s*hay|rabbit\s*pellet)\b/i,
  // Non-pet items that sometimes appear
  /\b(sunglasses|nail\s*art|fashion\s*accessor|jewelry|bracelet|necklace|earring|human\s*clothing|women'?s|men'?s\s*wear)\b/i,
];

/** Policy-unsafe aversive training patterns */
const POLICY_UNSAFE_PATTERNS: RegExp[] = [
  /shock\s*(collar|training|correction|system|fence|boundary)?/i,
  /static\s*correction/i,
  /electric\s*(fence|collar|training|shock|boundary)/i,
  /boundary\s*shock/i,
  /e-shock/i,
  /bark\s*(shock|static)/i,
  /aversive\s*training/i,
  /wireless\s*fence/i,
  /training\s*collar/i,
  /electric\s*collar/i,
  /containment\s*system/i,
  /anti[-\s]*bark\s*(shock|static|electric)/i,
  /correction\s*collar/i,
  /pet\s*shock/i,
  /zap/i,
  /prong\s*collar/i,
  /choke\s*chain/i,
  /gps\s*fence/i,
  /stimulation\s*(chain|collar)/i,
  /explosion[-\s]*proof/i,
  /guaranteed\s*(behavior|behaviour)\s*change/i,
];

/**
 * Returns true if the product is a valid cat/dog pet product.
 * Returns false for birds, reptiles, chickens, hamsters, fish, non-pet items.
 */
export function isCatOrDogProduct(name: string, category?: string | null, description?: string | null): boolean {
  const text = [name, category || '', description || ''].join(' ');
  return !NON_PET_PATTERNS.some(p => p.test(text));
}

/**
 * Returns true if the product contains policy-unsafe aversive training content.
 */
export function isPolicyUnsafe(name: string, description?: string | null): boolean {
  const text = `${name} ${description || ''}`;
  return POLICY_UNSAFE_PATTERNS.some(p => p.test(text));
}

/**
 * Combined check: product is safe for Google Merchant and site features.
 * Must be cat/dog AND not policy-unsafe.
 */
export function isGoogleSafeProduct(name: string, category?: string | null, description?: string | null): boolean {
  return isCatOrDogProduct(name, category, description) && !isPolicyUnsafe(name, description);
}

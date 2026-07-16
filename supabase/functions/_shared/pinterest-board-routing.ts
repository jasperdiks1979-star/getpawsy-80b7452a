// Pure, deterministic board routing for dog products.
// Adds intent-aware routing so that home ramps, feeding, toys, grooming and
// generic dog products no longer get force-routed to Dog Travel Accessories
// simply because a niche keyword like "ramp" appears.
//
// The 5 allowed dog-eligible production boards (see mem/marketing/
// pinterest-board-routing-map-v3.md):
//   • Dog Travel Accessories   — car seats, carriers, car ramps, travel bottles
//   • Dog Walking Essentials   — leashes, harnesses, collars, no-pull
//   • Luxury Pet Beds          — beds, sofas, orthopedic
//   • Smart Pet Gadgets        — smart/auto/app-controlled gadgets
//   • Pet Parent Hacks         — fallback for feeding/hydration/toys/grooming/
//                                home-access ramps until dedicated boards exist

export const DOG_BOARDS = {
  travel:   { id: "1117103951261719226", name: "Dog Travel Accessories",  category_key: "dog_travel" },
  walking:  { id: "1117103951261719227", name: "Dog Walking Essentials",  category_key: "dog_walking" },
  beds:     { id: "1117103951261719231", name: "Luxury Pet Beds",         category_key: "dog_beds" },
  gadgets:  { id: "1117103951261719234", name: "Smart Pet Gadgets",       category_key: "pet_gadgets" },
  fallback: { id: "1117103951261719232", name: "Pet Parent Hacks",        category_key: "pet_hacks" },
} as const;

export type DogBoardKey = keyof typeof DOG_BOARDS;

/** Returns the routing key for a dog product, given category + name blob. */
export function resolveDogBoardKey(category: string | null | undefined, name: string): DogBoardKey {
  const blob = `${category ?? ""} ${name}`.toLowerCase();

  // 1. Car-context travel gear FIRST (most specific).
  //    Requires an explicit vehicle/travel token — a bare "ramp" is NOT enough.
  const isCarContext = /\b(car|vehicle|suv|truck|auto|booster|back\s*seat|backseat|road\s*trip)\b/.test(blob);
  const isTravelItem = /\b(carrier|transport|stroller|seat\s*belt|crash[-\s]*tested)\b/.test(blob)
    || /\btravel\b.*\b(bottle|bowl|cup|mug|kit|bag)\b/.test(blob);
  if (isTravelItem || (isCarContext && /\b(ramp|stairs|steps|seat)\b/.test(blob))) {
    return "travel";
  }

  // 1b. Home-access ramps/stairs must NOT match the beds regex (which catches
  //     "for bed"). Route them to fallback before the beds check runs.
  if (/\b(ramp|stairs|steps|agility)\b/.test(blob)) {
    return "fallback";
  }

  // 2. Walking gear.
  if (/\b(leash|harness|collar|no[-\s]*pull|walking|lead|tether)\b/.test(blob)) {
    return "walking";
  }

  // 3. Beds & sofas (only when no ramp/stairs context — handled above).
  if (/\b(bed|sofa|couch|mattress|orthopedic|bolster|donut|cushion|lounger)\b/.test(blob)) {
    return "beds";
  }

  // 4. Smart / gadget.
  if (/\b(smart|auto(matic)?|app[-\s]*control|wifi|bluetooth|self[-\s]*cleaning|robotic|sensor)\b/.test(blob)) {
    return "gadgets";
  }

  // 5. Home ramps / stairs / feeding / toys / grooming → fallback (no dedicated
  //    board yet). This is the critical fix: a HOME ramp is not a travel item.
  //    Everything below explicitly falls through to Pet Parent Hacks.
  //    (feeding|hydration|bowl|fountain|toy|chew|enrichment|puzzle|
  //     grooming|brush|shampoo|nail|ramp|stairs|steps|agility)
  return "fallback";
}

/** Convenience: returns the full board record. */
export function resolveDogBoard(category: string | null | undefined, name: string) {
  return DOG_BOARDS[resolveDogBoardKey(category, name)];
}
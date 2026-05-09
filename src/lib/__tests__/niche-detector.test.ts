import { describe, it, expect } from "vitest";
import { detectNiche, explainNiche, type NicheKey } from "@/lib/niche-detector";

/**
 * Fixture products covering supported niches in pinterest-style-dna.
 * Guards against keyword-rule regressions: any reorder, removal, or
 * primary/requireAny/forbidAll change will surface a failing case.
 */
type Fixture = {
  label: string;
  expected: NicheKey;
  product: {
    name?: string;
    slug?: string;
    category?: string;
    product_type?: string;
  };
};

const FIXTURES: Fixture[] = [
  { label: "smart self-cleaning litter box", expected: "cat_litter",
    product: { name: "Automatic Cat Litter Box Self-Cleaning", slug: "auto-cat-litter-box", category: "Cat Litter Boxes" } },
  { label: "hidden cat litter enclosure", expected: "cat_litter",
    product: { name: "Hidden Cat Litter Box Enclosure", slug: "cat-litter-enclosure", category: "Cat Litter Boxes" } },
  { label: "tall cat tree tower", expected: "cat_tree",
    product: { name: "UFO Cat Tree Condo 49 Inch", slug: "ufo-cat-tree-condo", category: "Cat Trees Condos" } },
  { label: "wall mounted cat shelf", expected: "cat_tree",
    product: { name: "Wall Mounted Cat Shelf Set", slug: "wall-mounted-cat-shelf", category: "Cat Furniture" } },
  { label: "elevated cooling dog bed", expected: "dog_bed",
    product: { name: "Elevated Cooling Dog Bed Outdoor Pet Cot", slug: "dog-cot-cooling-pet-bed", category: "Dog Beds" } },
  { label: "orthopedic memory foam bed", expected: "dog_bed",
    product: { name: "Orthopedic Memory Foam Dog Bed", slug: "ortho-memory-foam-bed", category: "Dog Beds" } },
  { label: "dog stairs", expected: "dog_bed",
    product: { name: "Folding Pet Stairs for Dogs", slug: "pet-stairs-dogs", category: "Dog Accessories" } },
  { label: "calming donut bed", expected: "calming_bed",
    product: { name: "Calming Donut Bed Faux Fur", slug: "calming-donut-bed", category: "Dog Beds" } },
  { label: "anxiety bed", expected: "calming_bed",
    product: { name: "Anxiety Relief Pet Bed", slug: "anxiety-pet-bed", category: "Pet Beds" } },
  { label: "dog car seat cover", expected: "dog_car",
    product: { name: "Waterproof Dog Car Seat Cover", slug: "dog-car-seat-cover", category: "Dog Travel" } },
  { label: "no pull dog harness", expected: "dog_harness",
    product: { name: "No-Pull Dog Harness Vest", slug: "no-pull-dog-harness", category: "Dog Walking" } },
  { label: "expandable pet carrier backpack", expected: "dog_carrier",
    product: { name: "Expandable Pet Carrier Backpack", slug: "expandable-pet-carrier-backpack", category: "Dog Travel" } },
  { label: "portable dog stroller", expected: "dog_carrier",
    product: { name: "Portable Dog Stroller Foldable", slug: "dog-stroller-pet-stroller", category: "Dog Travel" } },
  { label: "cat carrier tote", expected: "cat_carrier",
    product: { name: "Soft-Sided Cat Carrier Tote", slug: "cat-carrier-tote", category: "Cat Travel" } },
  { label: "cat water fountain", expected: "cat_fountain",
    product: { name: "Stainless Steel Cat Water Fountain", slug: "cat-water-fountain", category: "Cat Feeding" } },
  { label: "automatic pet feeder", expected: "feeder",
    product: { name: "Smart Automatic Pet Feeder WiFi", slug: "smart-auto-feeder", category: "Pet Feeding" } },
  { label: "elevated dog bowl stand", expected: "bowl_station",
    product: { name: "Elevated Dog Bowl Stand Stainless", slug: "elevated-dog-bowl", category: "Pet Feeding" } },
  { label: "deshedding brush", expected: "grooming",
    product: { name: "Deshedding Brush for Dogs", slug: "deshedding-brush", category: "Grooming" } },
  { label: "pet grooming wipes", expected: "grooming",
    product: { name: "Pet Grooming Wipes Pack", slug: "pet-grooming-wipes", category: "Grooming" } },
  { label: "chew toy", expected: "interactive_toy",
    product: { name: "Squeaky Rubber Chew Toy", slug: "rubber-chew-toy", category: "Dog Toys" } },
  { label: "puzzle treat dispenser", expected: "interactive_toy",
    product: { name: "Interactive Puzzle Treat Dispenser", slug: "puzzle-treat-dispenser", category: "Dog Toys" } },
  { label: "leather dog collar", expected: "dog_collar",
    product: { name: "Leather Dog Collar with Tag", slug: "leather-dog-collar", category: "Dog Walking" } },
  { label: "GPS tracker", expected: "dog_training",
    product: { name: "GPS Tracker for Dogs", slug: "gps-tracker-dogs", category: "Dog Training" } },
  { label: "outdoor dog kennel", expected: "outdoor_house",
    product: { name: "Heavy Duty Dog Kennel Outdoor", slug: "outdoor-dog-kennel", category: "Outdoor" } },
  { label: "cardboard cat scratcher", expected: "cat_scratcher",
    product: { name: "Cardboard Cat Scratcher Lounge", slug: "cardboard-scratcher", category: "Cat Toys" } },
  { label: "plush cat bed", expected: "cat_bed",
    product: { name: "Plush Cat Bed Cushion", slug: "plush-cat-bed", category: "Cat Furniture" } },
  { label: "dog raincoat", expected: "dog_clothing",
    product: { name: "Waterproof Dog Raincoat with Hood", slug: "dog-raincoat", category: "Dog Apparel" } },
  { label: "chicken jerky treats", expected: "treats",
    product: { name: "Chicken Jerky Dog Treats", slug: "chicken-jerky-treats", category: "Dog Treats" } },
  { label: "puppy pee pads", expected: "potty_training",
    product: { name: "Extra Large Puppy Pee Pads", slug: "puppy-pee-pads", category: "Potty Training" } },
  { label: "pet monitoring camera", expected: "pet_camera",
    product: { name: "WiFi Pet Camera with Treat Toss", slug: "pet-camera", category: "Pet Tech" } },
  { label: "pet toothbrush kit", expected: "dental_care",
    product: { name: "Dog Toothbrush Dental Care Kit", slug: "dog-toothbrush", category: "Pet Health" } },
  { label: "vague pet accessory", expected: "generic_pet",
    product: { name: "Premium Pet Accessory", slug: "premium-pet-accessory", category: "Pet Lifestyle" } },
];

describe("niche-detector: fixture matrix", () => {
  for (const fx of FIXTURES) {
    it(`classifies "${fx.label}" -> ${fx.expected}`, () => {
      const result = detectNiche(fx.product);
      if (result !== fx.expected) {
        const trace = explainNiche(fx.product);
        // eslint-disable-next-line no-console
        console.error("Niche mismatch trace:", JSON.stringify(trace, null, 2));
      }
      expect(result).toBe(fx.expected);
    });
  }
});

describe("niche-detector: rule guards", () => {
  it("does not classify a chew TOY as treats (forbidAll guard)", () => {
    expect(detectNiche({ name: "Rubber Chew Toy", slug: "rubber-chew-toy", category: "Dog Toys" }))
      .toBe("interactive_toy");
  });

  it("requires cat context for litter classification", () => {
    expect(detectNiche({ name: "Yard Litter Cleanup", slug: "yard-litter", category: "Outdoor" }))
      .not.toBe("cat_litter");
  });

  it("requires dog/pet context for car seat -> dog_car", () => {
    expect(detectNiche({ name: "Universal Car Seat Cover", slug: "car-seat-cover", category: "Auto" }))
      .not.toBe("dog_car");
    expect(detectNiche({ name: "Dog Car Seat Cover", slug: "dog-car-seat-cover", category: "Dog Travel" }))
      .toBe("dog_car");
  });

  it("falls back to generic_pet when no rule matches", () => {
    expect(detectNiche({ name: "Mystery Item", slug: "mystery-item", category: "Misc" }))
      .toBe("generic_pet");
  });

  it("explainNiche returns a trace with haystack + matchedRule for hits", () => {
    const trace = explainNiche({ name: "Calming Donut Bed", slug: "calming-donut-bed", category: "Dog Beds" });
    expect(trace.niche).toBe("calming_bed");
    expect(trace.matchedRule?.id).toBeTruthy();
    expect(trace.haystack).toContain("calming");
  });

  it("explainNiche records near-misses for require blocks", () => {
    const trace = explainNiche({ name: "Adventure Harness", slug: "adventure-harness", category: "Outdoor" });
    const nm = trace.nearMisses.find((n) => n.id === "dog_harness.core");
    expect(nm).toBeTruthy();
    expect(nm?.missingRequire).toContain("dog");
  });
});

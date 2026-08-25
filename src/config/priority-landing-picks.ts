/**
 * priority-landing-picks — curated commercial boosts for guide pages that
 * already receive genuine discovery traffic (Bing, DuckDuckGo, Yahoo, Copilot,
 * ChatGPT, Ecosia). These are the only pages allowed to render the
 * answer-first PriorityPickBlock, so informational pages stay informational.
 *
 * Prices are never hardcoded here — the block resolves live products from
 * products_public so price/availability always match the storefront.
 */

export interface PriorityPick {
  /** Answer-first sentence for machine + human readers. */
  answer: string;
  /** Product name keywords (OR-matched, case-insensitive). */
  keywords: string[];
  /** Optional category names to restrict matching. */
  categories?: string[];
  /** Price ceiling to keep recommendations impulse-friendly. */
  maxPrice?: number;
  /** Contextual collection link. */
  collection: { slug: string; label: string };
  /** Anchor label for the CTA. */
  ctaLabel?: string;
}

export const PRIORITY_LANDING_PICKS: Record<string, PriorityPick> = {
  'how-to-train-cat-to-use-automatic-litter-box': {
    answer:
      'Most cats adapt to an automatic litter box within 7–14 days if you keep the old box nearby, leave the unit powered off for the first few days, and use the same litter your cat already knows.',
    keywords: ['litter box'],
    categories: ['Cat Litter Boxes'],
    collection: { slug: 'cat-litter-boxes', label: 'Shop litter boxes' },
    ctaLabel: 'See the litter box we recommend',
  },
  'how-does-self-cleaning-litter-box-work': {
    answer:
      'A self-cleaning litter box uses a weight or infrared sensor to detect when your cat leaves, waits a few minutes, then rakes or rotates clumps into a sealed waste drawer you empty roughly once a week.',
    keywords: ['litter box'],
    categories: ['Cat Litter Boxes'],
    collection: { slug: 'cat-litter-boxes', label: 'Shop litter boxes' },
    ctaLabel: 'See the litter box we recommend',
  },
  'best-odor-control-litter-box': {
    answer:
      'Odor control comes from three things: a fully enclosed or high-sided design, a non-porous surface (stainless steel beats plastic), and daily clump removal.',
    keywords: ['litter box'],
    categories: ['Cat Litter Boxes'],
    collection: { slug: 'cat-litter-boxes', label: 'Shop odor-control litter boxes' },
  },
  'litter-box-odor-control-solutions': {
    answer:
      'The fastest fix for litter box smell is an enclosed, non-porous box scooped daily — deodorizers only mask odor that a porous plastic box keeps absorbing.',
    keywords: ['litter box'],
    categories: ['Cat Litter Boxes'],
    collection: { slug: 'cat-litter-boxes', label: 'Shop odor-control litter boxes' },
  },
  'best-litter-box-senior-cats': {
    answer:
      'Senior cats need a low entry step (under ~4 in / 10 cm), a large open floor area, and high sides at the back to contain digging without forcing a climb.',
    keywords: ['litter box'],
    categories: ['Cat Litter Boxes'],
    collection: { slug: 'cat-litter-boxes', label: 'Shop litter boxes' },
  },
  'best-low-tracking-litter-box': {
    answer:
      'Low tracking comes from a top- or high-entry design plus a coarse-textured mat at the exit — the two together cut scattered litter far more than either alone.',
    keywords: ['litter box', 'litter mat'],
    categories: ['Cat Litter Boxes'],
    collection: { slug: 'cat-litter-boxes', label: 'Shop litter boxes' },
  },
  'best-cat-carrier-backpack': {
    answer:
      'A good cat carrier backpack has a rigid frame, mesh on at least two sides for airflow, and a padded chest strap — soft, unframed bags collapse on the cat during walking.',
    keywords: ['carrier', 'backpack'],
    maxPrice: 120,
    collection: { slug: 'best-cat-carriers', label: 'Shop cat carriers' },
  },
  'best-cat-carrier': {
    answer:
      'For vet visits and travel, pick a carrier with a top-loading lid — it lets you lower a reluctant cat in instead of pushing them through a front door.',
    keywords: ['carrier'],
    maxPrice: 120,
    collection: { slug: 'best-cat-carriers', label: 'Shop cat carriers' },
  },
  'best-cat-travel-carrier': {
    answer:
      'Airline-friendly cat carriers must fit under the seat (roughly 17 x 11 x 11 in), stay ventilated on multiple sides, and have a leak-resistant base.',
    keywords: ['carrier'],
    maxPrice: 120,
    collection: { slug: 'best-cat-carriers', label: 'Shop cat carriers' },
  },
  'best-cat-condo-for-multiple-cats': {
    answer:
      'Multi-cat households need at least one perch and one enclosed condo per cat, an anti-tip kit, and a wide base — vertical territory prevents most resource conflicts.',
    keywords: ['cat tree', 'cat tower', 'condo', 'perch'],
    collection: { slug: 'cat-trees-and-condos', label: 'Shop cat trees & condos' },
  },
  'luxury-cat-trees': {
    answer:
      'A well-built cat tree is judged on base width, sisal post thickness, and platform depth — not height alone. Anything over 60 in should ship with a wall anchor.',
    keywords: ['cat tree', 'cat tower', 'perch'],
    collection: { slug: 'cat-trees-and-condos', label: 'Shop cat trees & condos' },
  },
  'how-to-stop-cat-scratching-furniture': {
    answer:
      'Cats scratch to stretch and mark. Placing a tall, stable scratcher directly next to the furniture being targeted redirects the behaviour faster than any deterrent spray alone.',
    keywords: ['scratch'],
    maxPrice: 100,
    collection: { slug: 'best-cat-scratching-posts', label: 'Shop cat scratchers' },
  },
  'how-to-choose-the-right-dog-bed-size': {
    answer:
      'Measure your dog nose-to-tail while lying stretched out and add 8–12 in (20–30 cm). Sprawlers need a rectangular bed; curlers do fine with a bolster or donut shape.',
    keywords: ['dog bed', 'pet bed'],
    collection: { slug: 'dog-beds', label: 'Shop dog beds' },
  },
  // First-Sale Strike — guides confirmed to receive genuine (non-bot)
  // discovery traffic in the last 72h. Each maps to a live, in-stock product.
  'best-dog-bed-under-100': {
    answer:
      'Under $100 the two things that actually matter are a removable, machine-washable cover and a base thick enough that your dog does not bottom out on the floor.',
    keywords: ['dog bed', 'pet bed'],
    maxPrice: 100,
    collection: { slug: 'dog-beds', label: 'Shop dog beds under $100' },
    ctaLabel: 'See the dog bed we recommend',
  },
  'how-to-stop-cat-from-peeing-on-bed': {
    answer:
      'Cats usually pee outside the box because the box is dirty, too small, or in a high-traffic spot. Rule out a UTI first, then give one clean, enclosed box per cat plus one spare.',
    keywords: ['litter box'],
    categories: ['Cat Litter Boxes'],
    collection: { slug: 'cat-litter-boxes', label: 'Shop litter boxes' },
  },
  'dog-travel-essentials-guide': {
    answer:
      'The short list for any road trip: a secured carrier or harness, a collapsible water bowl, waste bags, and a familiar blanket so the car smells like home.',
    keywords: ['carrier', 'travel', 'water', 'collar', 'leash'],
    maxPrice: 90,
    collection: { slug: 'dog-travel', label: 'Shop dog travel gear' },
  },
  'pet-travel-checklist': {
    answer:
      'Pack ID tags, vaccination records, a leak-proof water dispenser, and enough food for the trip plus two extra days — swapping food mid-trip is the most common cause of travel stomach upset.',
    keywords: ['carrier', 'water', 'collar', 'travel'],
    maxPrice: 90,
    collection: { slug: 'dog-travel', label: 'Shop travel essentials' },
  },
  'best-cat-tree-for-kittens': {
    answer:
      'Kittens need low platforms (under 16 in apart), a wide stable base, and sisal — not carpet — so they learn to scratch the post instead of your sofa.',
    keywords: ['cat tree', 'perch', 'scratch'],
    maxPrice: 100,
    collection: { slug: 'cat-trees-and-condos', label: 'Shop cat trees' },
  },
};


export function getPriorityPick(slug?: string): PriorityPick | null {
  if (!slug) return null;
  return PRIORITY_LANDING_PICKS[slug] ?? null;
}

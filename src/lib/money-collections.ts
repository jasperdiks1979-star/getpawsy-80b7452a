/**
 * Money Collections — Top 10 Commercial Collections
 * 
 * Selected by: product count, commercial intent, US shipping eligibility.
 * These receive maximum internal link equity from homepage, footer, blog, and cross-links.
 */

export interface MoneyCollection {
  slug: string;
  name: string;
  shortName: string;
  icon: string;
  description: string;
  primaryKeyword: string;
  cluster: 'dog' | 'cat';
  /** Slugs of related money collections for cross-linking */
  crossLinks: string[];
  /** Supporting article slugs in the cluster */
  supportArticles: string[];
}

export const MONEY_COLLECTIONS: MoneyCollection[] = [
  {
    slug: 'cat-trees-and-condos',
    name: 'Cat Trees & Condos',
    shortName: 'Cat Trees',
    icon: '🐈',
    description: 'Multi-level cat trees, condos, and climbing furniture for indoor cats of all sizes.',
    primaryKeyword: 'best cat trees',
    cluster: 'cat',
    crossLinks: ['cat-litter-boxes', 'dog-beds'],
    supportArticles: [
      'best-cat-tree-for-large-cats-2026',
      'cat-tree-vs-scratching-post',
      'how-to-choose-cat-tree-height',
      'where-to-place-cat-tree-living-room',
    ],
  },
  {
    slug: 'cat-litter-boxes',
    name: 'Cat Litter Boxes',
    shortName: 'Litter Boxes',
    icon: '🧹',
    description: 'Self-cleaning, enclosed, and odor-control litter boxes for every cat household.',
    primaryKeyword: 'best cat litter boxes',
    cluster: 'cat',
    crossLinks: ['cat-trees-and-condos'],
    supportArticles: [
      'self-cleaning-litter-box-guide',
      'best-self-cleaning-litter-box-2026',
      'how-to-reduce-cat-litter-smell',
      'do-automatic-litter-boxes-work',
      'self-cleaning-vs-traditional-litter-box',
      'litter-box-for-multiple-cats',
      'how-often-to-clean-litter-box',
      'cat-litter-smell-solutions',
      'smart-litter-box-review',
      'is-automatic-litter-box-safe',
      'litter-box-cleaning-tips',
    ],
  },
  {
    slug: 'dog-beds',
    name: 'Dog Beds',
    shortName: 'Dog Beds',
    icon: '🛏️',
    description: 'Memory foam, orthopedic, and calming dog beds for joint support and anxiety relief.',
    primaryKeyword: 'orthopedic dog beds',
    cluster: 'dog',
    crossLinks: ['dog-travel-accessories', 'cat-trees-and-condos'],
    supportArticles: [
      'orthopedic-dog-bed-buying-guide-2026',
      'best-dog-bed-for-senior-dogs',
      'calming-dog-bed-anxiety-relief',
      'how-to-choose-dog-bed-size',
    ],
  },
  {
    slug: 'best-dog-harnesses',
    name: 'Best Dog Harnesses',
    shortName: 'Dog Harnesses',
    icon: '🦮',
    description: 'No-pull, front-clip, and comfortable dog harnesses for every breed and size.',
    primaryKeyword: 'best no-pull dog harness',
    cluster: 'dog',
    crossLinks: ['dog-beds', 'dog-travel-accessories'],
    supportArticles: [
      'no-pull-harness-vs-collar-2026',
      'how-to-measure-dog-for-harness',
      'best-harness-for-large-dogs',
      'harness-training-guide-puppies',
    ],
  },
  {
    slug: 'best-dog-car-seats',
    name: 'Best Dog Car Seats',
    shortName: 'Dog Car Seats',
    icon: '🚗',
    description: 'Crash-tested dog car seats and booster seats for safe travel with your pet.',
    primaryKeyword: 'best dog car seats',
    cluster: 'dog',
    crossLinks: ['dog-travel-accessories', 'dog-beds'],
    supportArticles: [
      'dog-car-seat-safety-guide-2026',
      'are-dog-booster-seats-safe',
      'dog-car-seat-laws-usa',
      'how-to-measure-dog-for-car-seat',
    ],
  },
  {
    slug: 'best-interactive-dog-toys',
    name: 'Best Interactive Dog Toys',
    shortName: 'Dog Toys',
    icon: '🎾',
    description: 'Puzzle toys, enrichment toys, and indestructible chew toys for mental stimulation.',
    primaryKeyword: 'best interactive dog toys',
    cluster: 'dog',
    crossLinks: ['dog-beds', 'dog-travel-accessories'],
    supportArticles: [
      'best-puzzle-toys-for-dogs-2026',
      'mental-stimulation-games-for-dogs',
      'indestructible-toys-power-chewers',
      'diy-dog-enrichment-activities',
    ],
  },
  {
    slug: 'best-cat-scratching-posts',
    name: 'Best Cat Scratching Posts',
    shortName: 'Scratching Posts',
    icon: '🐱',
    description: 'Sisal, cardboard, and modern scratching posts to protect your furniture.',
    primaryKeyword: 'best cat scratching posts',
    cluster: 'cat',
    crossLinks: ['cat-trees-and-condos', 'cat-litter-boxes'],
    supportArticles: [
      'sisal-vs-cardboard-scratching-post',
      'how-to-stop-cat-scratching-furniture',
      'best-scratching-post-for-kittens',
      'tall-scratching-post-vs-cat-tree',
    ],
  },
  {
    slug: 'best-slow-feeder-dog-bowls',
    name: 'Best Slow Feeder Dog Bowls',
    shortName: 'Slow Feeders',
    icon: '🥣',
    description: 'Anti-gulp bowls and puzzle feeders to prevent bloat and promote healthy eating.',
    primaryKeyword: 'slow feeder dog bowls',
    cluster: 'dog',
    crossLinks: ['best-dog-water-bowl-for-messy-drinkers', 'best-elevated-dog-bed'],
    supportArticles: [
      'slow-feeder-bowl-benefits-dogs',
      'best-bowl-for-fast-eating-dog',
      'elevated-vs-floor-dog-bowls',
      'dog-bloat-prevention-tips',
    ],
  },
  {
    slug: 'best-cat-carriers',
    name: 'Best Cat Carriers',
    shortName: 'Cat Carriers',
    icon: '✈️',
    description: 'Airline-approved, soft-sided, and backpack cat carriers for stress-free travel.',
    primaryKeyword: 'best cat carriers',
    cluster: 'cat',
    crossLinks: ['best-cat-carrier-for-vet-visits', 'best-cat-beds'],
    supportArticles: [
      'airline-approved-cat-carrier-guide',
      'how-to-get-cat-used-to-carrier',
      'best-cat-carrier-for-anxious-cats',
      'cat-carrier-size-guide',
    ],
  },
  {
    slug: 'best-interactive-cat-toys',
    name: 'Best Interactive Cat Toys',
    shortName: 'Cat Toys',
    icon: '🧶',
    description: 'Electronic, laser, and feather toys to beat boredom and enrich indoor cats.',
    primaryKeyword: 'best interactive cat toys',
    cluster: 'cat',
    crossLinks: ['best-cat-toys-for-indoor-cats', 'best-cat-toys-for-bored-cats'],
    supportArticles: [
      'best-electronic-cat-toys-2026',
      'indoor-cat-enrichment-guide',
      'laser-toys-safe-for-cats',
      'diy-cat-toy-ideas',
    ],
  },
  {
    slug: 'best-pet-strollers',
    name: 'Best Pet Strollers',
    shortName: 'Pet Strollers',
    icon: '🛒',
    description: 'Heavy-duty, foldable, and jogging pet strollers for dogs and cats of all sizes.',
    primaryKeyword: 'best pet strollers',
    cluster: 'dog',
    crossLinks: ['best-dog-car-seats', 'best-cat-carriers', 'best-dog-harnesses'],
    supportArticles: [
      'pet-stroller-buying-guide-2026',
      'best-pet-stroller-for-large-dogs',
      'jogging-stroller-vs-standard-pet-stroller',
      'pet-stroller-for-senior-dogs',
    ],
  },
  {
    slug: 'dog-training-tools',
    name: 'Dog Training Tools & Accessories',
    shortName: 'Dog Training',
    icon: '🎓',
    description: 'Clickers, treat pouches, training pads, and behavior correction tools for all dog breeds.',
    primaryKeyword: 'best dog training tools',
    cluster: 'dog',
    crossLinks: ['best-dog-harnesses', 'best-interactive-dog-toys', 'best-slow-feeder-dog-bowls'],
    supportArticles: [
      'best-dog-training-tools',
      'puppy-training-first-30-days',
      'leash-training-dog-step-by-step',
      'how-to-stop-dog-barking',
    ],
  },
  {
    slug: 'dog-travel-accessories',
    name: 'Dog Travel Accessories',
    shortName: 'Dog Travel',
    icon: '✈️',
    description: 'Car seat covers, travel water bottles, portable crates, and airline-approved gear for traveling with dogs.',
    primaryKeyword: 'best dog travel accessories',
    cluster: 'dog',
    crossLinks: ['best-dog-car-seats', 'best-dog-harnesses', 'best-pet-strollers'],
    supportArticles: [
      'dog-travel-checklist-2026',
      'flying-with-a-dog-guide',
      'road-trip-with-dog-essentials',
      'best-portable-dog-crate-travel',
    ],
  },
];

/** Quick lookup set for money collection slugs */
export const MONEY_COLLECTION_SLUGS = new Set(MONEY_COLLECTIONS.map(mc => mc.slug));

/** Get money collection by slug */
export function getMoneyCollection(slug: string): MoneyCollection | undefined {
  return MONEY_COLLECTIONS.find(mc => mc.slug === slug);
}

/** Get all money collections for a species */
export function getMoneyCollectionsBySpecies(species: 'dog' | 'cat'): MoneyCollection[] {
  return MONEY_COLLECTIONS.filter(mc => mc.cluster === species);
}

/**
 * Cluster article definitions for Phase 3.
 * Each money collection has 4 supporting articles that form a pillar-support cluster.
 */
export interface ClusterArticle {
  slug: string;
  title: string;
  parentCollectionSlug: string;
  siblingArticleSlugs: string[];
  faqCount: number;
}

/** Generate cluster articles from money collections */
export function getClusterArticles(): ClusterArticle[] {
  const articles: ClusterArticle[] = [];
  for (const mc of MONEY_COLLECTIONS) {
    const siblings = mc.supportArticles;
    for (const slug of siblings) {
      articles.push({
        slug,
        title: slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        parentCollectionSlug: mc.slug,
        siblingArticleSlugs: siblings.filter(s => s !== slug).slice(0, 2),
        faqCount: 3,
      });
    }
  }
  return articles;
}

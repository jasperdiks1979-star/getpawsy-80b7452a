/**
 * Silo Configuration — Single source of truth for the Dog & Cat silo architecture.
 * 
 * Rules enforced:
 * - No cross-silo linking (dog pages never link to cat pages and vice versa)
 * - Every page links back to its silo hub and pillar
 * - Anchor text follows natural descriptive patterns (no exact-match spam)
 */

export type SiloId = 'dog' | 'cat';

export interface SiloLink {
  href: string;
  label: string;
  desc: string;
}

export interface SiloConfig {
  id: SiloId;
  hub: SiloLink;
  pillar: SiloLink;
  training: SiloLink;
  travel: SiloLink;
  /** Sub-collections within this silo */
  subCollections: SiloLink[];
  /** Blog filter path for this silo */
  blogPath: string;
  /** Categories that belong to this silo */
  categories: string[];
}

export const DOG_SILO: SiloConfig = {
  id: 'dog',
  hub: {
    href: '/dog/',
    label: 'Dog Training & Travel Gear',
    desc: 'Browse all dog training & travel essentials',
  },
  pillar: {
    href: '/dog/best-dog-training-and-travel-gear-2026',
    label: 'Complete Dog Training & Travel Guide 2026',
    desc: 'Expert buyer guide for harnesses, leashes & car seats',
  },
  training: {
    href: '/dog/training/',
    label: 'Dog Training Essentials',
    desc: 'No-pull harnesses, leashes & behavior tools',
  },
  travel: {
    href: '/dog/travel/',
    label: 'Dog Travel Safety Gear',
    desc: 'Car seats, travel harnesses & carriers',
  },
  subCollections: [
    { href: '/collections/dog-potty-training', label: 'Potty Training', desc: 'Pads, trays, sprays & bell systems' },
    { href: '/collections/dog-leash-control', label: 'Leash & Control', desc: 'No-pull harnesses & training leashes' },
    { href: '/collections/dog-anti-bark', label: 'Anti-Bark Solutions', desc: 'Humane bark control & calming aids' },
    { href: '/collections/puppy-training-essentials', label: 'Puppy Essentials', desc: 'Complete starter kits for first 12 months' },
    { href: '/collections/dog-training-accessories', label: 'Training Accessories', desc: 'Clickers, treat bags & agility gear' },
    { href: '/dog/dog-training-behavior-tools', label: 'Training & Behavior Tools', desc: 'Harnesses, leashes & training aids' },
    { href: '/dog/dog-car-travel-safety', label: 'Car Travel Safety', desc: 'Car seats, harnesses & hammocks' },
  ],
  blogPath: '/blog?category=dogs',
  categories: ['Dog Training', 'Dog Carriers', 'Dog Collars & Leashes', 'Dog Toys', 'Dog Beds', 'Dog Bowls'],
};

export const CAT_SILO: SiloConfig = {
  id: 'cat',
  hub: {
    href: '/cat/',
    label: 'Cat Training & Travel Gear',
    desc: 'Browse all cat training & travel essentials',
  },
  pillar: {
    href: '/cat/best-cat-training-and-travel-gear-2026',
    label: 'Complete Cat Training & Travel Guide 2026',
    desc: 'Expert buyer guide for cat trees, carriers & enrichment',
  },
  training: {
    href: '/cat/training/',
    label: 'Cat Enrichment & Training',
    desc: 'Cat trees, scratching posts & interactive toys',
  },
  travel: {
    href: '/cat/travel/',
    label: 'Cat Travel Essentials',
    desc: 'Airline-approved carriers & travel gear',
  },
  subCollections: [
    { href: '/cat/cat-trees-for-large-cats', label: 'Cat Trees for Large Cats', desc: 'Stability-tested for 25+ lbs' },
    { href: '/guides/best-cat-litter-box-2026', label: 'Best Litter Boxes 2026', desc: 'Odor control & self-cleaning' },
    { href: '/guides/best-cat-trees-large-cats-2026', label: 'Best Cat Trees 2026', desc: '9 trees tested for stability' },
  ],
  blogPath: '/blog?category=cats',
  categories: ['Cat Trees & Condos', 'Cat Carriers', 'Cat Toys', 'Cat Scratching Posts', 'Cat Furniture', 'Cat Houses', 'Cat Beds', 'Cat Bowls'],
};

const SILOS: Record<SiloId, SiloConfig> = { dog: DOG_SILO, cat: CAT_SILO };

/** Get silo config by ID */
export function getSilo(id: SiloId): SiloConfig {
  return SILOS[id];
}

/** Determine which silo a path belongs to (or null if outside silos) */
export function getSiloForPath(pathname: string): SiloId | null {
  if (pathname.startsWith('/dog')) return 'dog';
  if (pathname.startsWith('/cat')) return 'cat';
  return null;
}

/** Check if a link target is within the same silo */
export function isSameSilo(currentSilo: SiloId, targetHref: string): boolean {
  const targetSilo = getSiloForPath(targetHref);
  return targetSilo === currentSilo;
}

/** Get the opposite silo (for validation — should never be linked to) */
export function getOppositeSilo(id: SiloId): SiloId {
  return id === 'dog' ? 'cat' : 'dog';
}

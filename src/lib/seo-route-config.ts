/**
 * SEO Route Configuration — Single Source of Truth
 *
 * Defines the namespaced URL hierarchy for all SEO pillar + intent pages.
 * Used by SeoPillar, SeoIntent, legacy redirects, sitemap generation,
 * and internal link components.
 *
 * URL taxonomy:
 *   /dog/{pillarSlug}                — Dog pillar pages
 *   /dog/{pillarSlug}/{intentSlug}   — Dog sub-intent pages
 *   /cat/{pillarSlug}                — Cat pillar pages
 *   /cat/{pillarSlug}/{intentSlug}   — Cat sub-intent pages
 */

import { SITE_URL } from '@/lib/constants';

export type SeoNamespace = 'dog' | 'cat';

export interface SeoIntent {
  slug: string;
  title: string;
  keyword: string;
  /** Component import path key — maps to lazy import in App.tsx */
  componentKey: string;
}

export interface SeoPillar {
  namespace: SeoNamespace;
  slug: string;
  title: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  /** Component import path key */
  componentKey: string;
  intents: SeoIntent[];
}

// ============================================================
// PILLAR DEFINITIONS
// ============================================================

export const SEO_PILLARS: SeoPillar[] = [
  // ── ORTHOPEDIC DOG BEDS ──
  {
    namespace: 'dog',
    slug: 'orthopedic-dog-beds',
    title: 'Orthopedic Dog Beds for Large Dogs & Arthritis',
    primaryKeyword: 'orthopedic dog beds',
    secondaryKeywords: ['memory foam dog bed', 'dog bed for arthritis', 'senior dog bed'],
    componentKey: 'OrthopedicDogBeds',
    intents: [
      {
        slug: 'best-for-large-dogs',
        title: 'Best Orthopedic Dog Bed for Large Dogs',
        keyword: 'orthopedic dog bed large dogs',
        componentKey: 'OrthopedicLargeDogs',
      },
      {
        slug: 'waterproof',
        title: 'Waterproof Orthopedic Dog Bed',
        keyword: 'waterproof orthopedic dog bed',
        componentKey: 'WaterproofOrthopedicBed',
      },
      {
        slug: 'memory-foam',
        title: 'Memory Foam Dog Beds',
        keyword: 'memory foam dog bed',
        componentKey: 'MemoryFoamDogBeds',
      },
    ],
  },

  // ── DOG CAR TRAVEL SAFETY ──
  {
    namespace: 'dog',
    slug: 'dog-car-travel-safety',
    title: 'Dog Car Seats & Travel Safety – Crash Tested',
    primaryKeyword: 'dog car travel safety',
    secondaryKeywords: ['dog car seat', 'dog booster seat', 'dog car harness'],
    componentKey: 'DogCarTravelSafety',
    intents: [
      {
        slug: 'car-seats',
        title: 'Dog Car Seats for Small Dogs',
        keyword: 'dog car seat small dogs',
        componentKey: 'DogCarSeatSmallDogs',
      },
      {
        slug: 'booster-seats',
        title: 'Dog Booster Seats',
        keyword: 'dog booster seat',
        componentKey: 'DogBoosterSeat',
      },
      {
        slug: 'harness-safety',
        title: 'Dog Car Harness Safety',
        keyword: 'dog car harness',
        componentKey: 'DogCarHarness',
      },
    ],
  },

  // ── CAT TREES FOR LARGE CATS ──
  {
    namespace: 'cat',
    slug: 'cat-trees-for-large-cats',
    title: 'Best Cat Trees for Large Cats – Heavy Duty & Extra Tall',
    primaryKeyword: 'cat trees for large cats',
    secondaryKeywords: ['heavy duty cat tree', 'cat tree maine coon', 'large cat condo'],
    componentKey: 'CatTreesForLargeCats',
    intents: [
      {
        slug: 'for-maine-coon',
        title: 'Cat Tree for Maine Coon',
        keyword: 'cat tree for maine coon',
        componentKey: 'CatTreeMaineCoon',
      },
      {
        slug: 'heavy-duty',
        title: 'Heavy Duty Cat Tree',
        keyword: 'heavy duty cat tree',
        componentKey: 'HeavyDutyCatTree',
      },
      {
        slug: 'large-cat-condos',
        title: 'Cat Condos for Large Cats',
        keyword: 'large cat condo',
        componentKey: 'LargeCatCondo',
      },
    ],
  },
];

// ============================================================
// LOOKUP UTILITIES
// ============================================================

const _pillarMap = new Map<string, SeoPillar>();
for (const p of SEO_PILLARS) {
  _pillarMap.set(`${p.namespace}/${p.slug}`, p);
}

/** Find a pillar by namespace + slug */
export function findPillar(namespace: string, pillarSlug: string): SeoPillar | undefined {
  return _pillarMap.get(`${namespace}/${pillarSlug}`);
}

/** Find an intent within a pillar */
export function findIntent(namespace: string, pillarSlug: string, intentSlug: string): SeoIntent | undefined {
  const pillar = findPillar(namespace, pillarSlug);
  return pillar?.intents.find(i => i.slug === intentSlug);
}

/** Build canonical URL for a pillar */
export function pillarCanonical(namespace: SeoNamespace, pillarSlug: string): string {
  return `${SITE_URL}/${namespace}/${pillarSlug}`;
}

/** Build canonical URL for an intent */
export function intentCanonical(namespace: SeoNamespace, pillarSlug: string, intentSlug: string): string {
  return `${SITE_URL}/${namespace}/${pillarSlug}/${intentSlug}`;
}

/** Get sibling intents (excluding self) */
export function getSiblingIntents(namespace: SeoNamespace, pillarSlug: string, currentIntentSlug: string): SeoIntent[] {
  const pillar = findPillar(namespace, pillarSlug);
  if (!pillar) return [];
  return pillar.intents.filter(i => i.slug !== currentIntentSlug);
}

/** Get cross-cluster pillars (other pillars) */
export function getCrossClusterPillars(currentPillarSlug: string): SeoPillar[] {
  return SEO_PILLARS.filter(p => p.slug !== currentPillarSlug);
}

/** All pillar slugs for validation */
export function getAllPillarKeys(): string[] {
  return SEO_PILLARS.map(p => `${p.namespace}/${p.slug}`);
}

// ============================================================
// LEGACY REDIRECT MAP
// ============================================================

/** Maps old URLs to new namespaced canonical paths */
export const LEGACY_REDIRECT_MAP: Record<string, string> = {
  // Old root-level pillar paths
  '/orthopedic-dog-beds': '/dog/orthopedic-dog-beds',
  '/cat-trees-for-large-cats': '/cat/cat-trees-for-large-cats',
  '/dog-car-travel-safety': '/dog/dog-car-travel-safety',
  // Old /collections/ pillar paths
  '/collections/orthopedic-dog-beds': '/dog/orthopedic-dog-beds',
  '/collections/cat-trees-for-large-cats': '/cat/cat-trees-for-large-cats',
  '/collections/dog-car-travel-safety': '/dog/dog-car-travel-safety',
  // Old /collections/ sub-intent paths
  '/collections/best-orthopedic-dog-bed-large-dogs': '/dog/orthopedic-dog-beds/best-for-large-dogs',
  '/collections/waterproof-orthopedic-dog-bed': '/dog/orthopedic-dog-beds/waterproof',
  '/collections/memory-foam-dog-beds': '/dog/orthopedic-dog-beds/memory-foam',
  '/collections/cat-tree-for-maine-coon': '/cat/cat-trees-for-large-cats/for-maine-coon',
  '/collections/heavy-duty-cat-tree': '/cat/cat-trees-for-large-cats/heavy-duty',
  '/collections/cat-condos-for-large-cats': '/cat/cat-trees-for-large-cats/large-cat-condos',
  '/collections/dog-car-seats': '/dog/dog-car-travel-safety/car-seats',
  '/collections/dog-booster-seat': '/dog/dog-car-travel-safety/booster-seats',
  '/collections/dog-car-harness': '/dog/dog-car-travel-safety/harness-safety',
};

/** Check if a path is a legacy redirect */
export function getLegacyRedirect(pathname: string): string | undefined {
  return LEGACY_REDIRECT_MAP[pathname];
}

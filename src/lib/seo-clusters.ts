/**
 * SEO topic clusters: collection → pillar guide → supporting guides.
 *
 * One pillar per intent cluster; supporting guides cover genuinely distinct
 * sub-intents. Every slug here must be a canonical, indexable guide (enforced
 * by tests against the sitemap). Used by the hydrated guide page and the
 * build-time prerenderers so both expose the same crawl paths.
 */

export interface SeoCluster {
  key: string;
  label: string;
  collection: string;
  pillar: string;
  supporting: string[];
  /** False while the collection is thin/noindex: guides must not link it. */
  linkCollection?: boolean;
}

export const SEO_CLUSTERS: SeoCluster[] = [
  {
    key: 'litter-boxes', label: 'Cat litter boxes', collection: 'cat-litter-boxes',
    pillar: 'best-cat-litter-box-2026',
    supporting: [
      'cat-litter-box-guide', 'best-self-cleaning-litter-box-2026', 'automatic-litter-box-guide',
      'best-odor-control-litter-box', 'best-extra-large-litter-boxes', 'best-litter-boxes-apartments-2026',
      'best-litter-boxes-multi-cat', 'covered-vs-open-litter-box', 'how-to-clean-cat-litter-box',
    ],
  },
  {
    key: 'cat-trees', label: 'Cat trees & condos', collection: 'cat-trees-and-condos',
    pillar: 'best-cat-trees-2026',
    supporting: [
      'cat-tree-buying-guide', 'best-cat-trees-large-cats-2026', 'best-cat-trees-small-apartments',
      'best-cat-condo-2026', 'cat-condo-vs-cat-tower', 'choosing-safe-cat-tree-indoor', 'best-cat-scratching-post',
    ],
  },
  {
    key: 'cat-toys', label: 'Cat toys & enrichment', collection: 'cat-toys',
    pillar: 'cat-toy-buying-guide',
    supporting: [
      'best-cat-toys', 'best-interactive-cat-toys-that-work', 'best-toys-for-bored-indoor-cats',
      'best-automatic-cat-toy', 'best-cat-enrichment-ideas-indoor-cats-2026',
    ],
  },
  {
    key: 'cat-beds', label: 'Cat beds', collection: 'cat-beds', linkCollection: false,
    pillar: 'cat-bed-guide',
    supporting: ['best-cat-bed'],
  },
  {
    key: 'dog-beds', label: 'Dog beds', collection: 'dog-beds',
    pillar: 'best-dog-bed-2026',
    supporting: [
      'best-orthopedic-dog-bed-2026', 'best-dog-beds-for-large-dogs', 'how-to-choose-the-right-dog-bed-size',
      'best-dog-bed-materials-explained', 'how-to-wash-a-dog-bed-properly',
    ],
  },
];

export function clusterForGuide(slug: string): SeoCluster | undefined {
  return SEO_CLUSTERS.find((c) => c.pillar === slug || c.supporting.includes(slug));
}

export function clusterForCollection(slug: string): SeoCluster | undefined {
  return SEO_CLUSTERS.find((c) => c.collection === slug);
}

// Mirrors APPROVED_FREE_SHIPPING_LINE + APPROVED_RETURNS_LINE (merchant-policy);
// kept literal because this module also loads in the build config (no @ alias). Test-enforced.
export const COLLECTION_TRUST_LINE = 'Free shipping on eligible orders $35+, 30-day returns.';
const TRUST = COLLECTION_TRUST_LINE;

/**
 * Canonical collection metadata. Replaces stored copy that asserted unverified
 * counts ("400+", "600+"), quality ("premium", "built to last") or features
 * the current range does not evidence. Only category facts + approved policy.
 */
export const CANONICAL_COLLECTION_META: Record<string, { title: string; description: string; h1?: string; intro?: string }> = {
  dogs: { title: 'Dog Products | GetPawsy', description: `Shop dog beds, toys and accessories at GetPawsy. ${TRUST}` },
  cats: { title: 'Cat Products | GetPawsy', description: `Shop cat trees, litter boxes, toys and beds at GetPawsy. ${TRUST}` },
  'dog-beds': { title: 'Dog Beds | GetPawsy', description: `Shop dog beds at GetPawsy. ${TRUST}` },
  'cat-trees-and-condos': { title: 'Cat Trees & Condos | GetPawsy', description: `Shop cat trees, towers and condos with scratching posts and perches at GetPawsy. ${TRUST}` },
  'cat-litter-boxes': {
    title: 'Cat Litter Boxes – Covered & Stainless Steel | GetPawsy',
    description: `Shop covered, hooded, fully enclosed and stainless steel cat litter boxes, plus litter mats, at GetPawsy. ${TRUST}`,
    h1: 'Cat Litter Boxes',
    intro: `Covered, hooded, fully enclosed and stainless steel litter boxes, plus litter mats. Check each listing for size and entry style, or read our cat litter box buying guide. ${TRUST}`,
  },
  'cat-toys': { title: 'Cat Toys | GetPawsy', description: `Shop interactive, wand and puzzle cat toys at GetPawsy. ${TRUST}` },
  'cat-beds': { title: 'Cat Beds | GetPawsy', description: `Shop cat beds at GetPawsy. ${TRUST}` },
};

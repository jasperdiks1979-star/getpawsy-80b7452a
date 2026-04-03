/**
 * US Keyword Research — 3 Primary Niches
 * 
 * Structure: primary keyword, supporting keywords, intent, target pages, internal links.
 * estimated_volume_range: manual override when no API data available.
 * 
 * Integration: optionally fetch from Google Ads Keyword Planner API
 * via env var VITE_GOOGLE_ADS_API_KEY (graceful fallback if missing).
 */

export interface NicheKeyword {
  keyword: string;
  intent: 'transactional' | 'informational' | 'navigational';
  estimated_volume_range: string; // e.g. "10K–100K"
  target_page: string;
  internal_link_targets: string[];
}

export interface NicheConfig {
  id: string;
  name: string;
  primary_keyword: string;
  shop_page: string;
  guide_page: string;
  supporting_keywords: NicheKeyword[];
}

export const NICHE_KEYWORD_RESEARCH: NicheConfig[] = [
  {
    id: 'cat-trees',
    name: 'Cat Trees & Cat Condos',
    primary_keyword: 'cat trees for large cats',
    shop_page: '/collections/cat-trees-and-condos',
    guide_page: '/guides/best-cat-trees-large-cats-2026',
    supporting_keywords: [
      { keyword: 'cat trees for large cats', intent: 'transactional', estimated_volume_range: '10K–100K', target_page: '/collections/cat-trees-and-condos', internal_link_targets: ['/guides/best-cat-trees-large-cats-2026', '/collections/cat-condos'] },
      { keyword: 'heavy duty cat tree', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-trees-and-condos', internal_link_targets: ['/guides/best-cat-trees-large-cats-2026'] },
      { keyword: 'best cat tree 2026', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-trees-and-condos', internal_link_targets: ['/guides/best-cat-trees-large-cats-2026'] },
      { keyword: 'cat tower for maine coon', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-trees-and-condos', internal_link_targets: [] },
      { keyword: 'tall cat tree', intent: 'transactional', estimated_volume_range: '10K–100K', target_page: '/collections/cat-trees-and-condos', internal_link_targets: [] },
      { keyword: 'modern cat tree', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/modern-cat-trees', internal_link_targets: ['/collections/cat-trees-and-condos'] },
      { keyword: 'cat condo for large cats', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-condos', internal_link_targets: ['/collections/cat-trees-and-condos'] },
      { keyword: 'cat tree with hammock', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-trees-and-condos', internal_link_targets: [] },
      { keyword: 'multi level cat tree', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-trees-and-condos', internal_link_targets: [] },
      { keyword: 'cat tree for apartment', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-trees-and-condos', internal_link_targets: [] },
      { keyword: 'how to choose a cat tree', intent: 'informational', estimated_volume_range: '100–1K', target_page: '/guides/best-cat-trees-large-cats-2026', internal_link_targets: ['/collections/cat-trees-and-condos'] },
      { keyword: 'cat tree vs cat condo', intent: 'informational', estimated_volume_range: '100–1K', target_page: '/guides/best-cat-trees-large-cats-2026', internal_link_targets: ['/collections/cat-condos'] },
      { keyword: 'best cat tree for overweight cats', intent: 'transactional', estimated_volume_range: '100–1K', target_page: '/collections/cat-trees-and-condos', internal_link_targets: [] },
      { keyword: 'cat scratching post tree', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/best-cat-scratching-posts', internal_link_targets: ['/collections/cat-trees-and-condos'] },
      { keyword: 'luxury cat tree', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-trees-and-condos', internal_link_targets: [] },
    ],
  },
  {
    id: 'litter-boxes',
    name: 'Cat Litter Boxes',
    primary_keyword: 'best cat litter box',
    shop_page: '/collections/cat-litter-boxes',
    guide_page: '/guides/best-cat-litter-box-2026',
    supporting_keywords: [
      { keyword: 'best cat litter box', intent: 'transactional', estimated_volume_range: '10K–100K', target_page: '/collections/cat-litter-boxes', internal_link_targets: ['/guides/best-cat-litter-box-2026'] },
      { keyword: 'self cleaning litter box', intent: 'transactional', estimated_volume_range: '10K–100K', target_page: '/collections/cat-litter-boxes', internal_link_targets: ['/guides/self-cleaning-litter-box-worth-it'] },
      { keyword: 'enclosed litter box', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-litter-boxes', internal_link_targets: [] },
      { keyword: 'odor control litter box', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-litter-boxes', internal_link_targets: [] },
      { keyword: 'litter box for large cats', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-litter-boxes', internal_link_targets: [] },
      { keyword: 'automatic litter box', intent: 'transactional', estimated_volume_range: '10K–100K', target_page: '/collections/cat-litter-boxes', internal_link_targets: ['/guides/self-cleaning-litter-box-worth-it'] },
      { keyword: 'litter box furniture', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-litter-boxes', internal_link_targets: ['/guides/best-cat-litter-box-furniture-enclosures-2026'] },
      { keyword: 'covered litter box', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-litter-boxes', internal_link_targets: [] },
      { keyword: 'top entry litter box', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-litter-boxes', internal_link_targets: [] },
      { keyword: 'best litter box for multi cat home', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-litter-boxes', internal_link_targets: [] },
      { keyword: 'is self cleaning litter box worth it', intent: 'informational', estimated_volume_range: '1K–10K', target_page: '/guides/self-cleaning-litter-box-worth-it', internal_link_targets: ['/collections/cat-litter-boxes'] },
      { keyword: 'how to reduce litter box smell', intent: 'informational', estimated_volume_range: '100–1K', target_page: '/guides/best-cat-litter-box-2026', internal_link_targets: ['/collections/cat-litter-boxes'] },
      { keyword: 'litter box enclosure', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-litter-boxes', internal_link_targets: [] },
      { keyword: 'smart litter box', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-litter-boxes', internal_link_targets: [] },
      { keyword: 'cat litter box cabinet', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/cat-litter-boxes', internal_link_targets: [] },
    ],
  },
  {
    id: 'slow-feeder-bowls',
    name: 'Slow Feeder Dog Bowls',
    primary_keyword: 'slow feeder dog bowl',
    shop_page: '/collections/slow-feeder-dog-bowls',
    guide_page: '/guides/best-slow-feeder-dog-bowls-2026',
    supporting_keywords: [
      { keyword: 'slow feeder dog bowl', intent: 'transactional', estimated_volume_range: '10K–100K', target_page: '/collections/slow-feeder-dog-bowls', internal_link_targets: ['/guides/best-slow-feeder-dog-bowls-2026'] },
      { keyword: 'anti gulp dog bowl', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/slow-feeder-dog-bowls', internal_link_targets: [] },
      { keyword: 'best slow feeder bowl for dogs', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/slow-feeder-dog-bowls', internal_link_targets: ['/guides/best-slow-feeder-dog-bowls-2026'] },
      { keyword: 'slow feeder for large dogs', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/slow-feeder-dog-bowls', internal_link_targets: [] },
      { keyword: 'puzzle feeder dog bowl', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/slow-feeder-dog-bowls', internal_link_targets: [] },
      { keyword: 'dog eats too fast', intent: 'informational', estimated_volume_range: '10K–100K', target_page: '/guides/best-slow-feeder-dog-bowls-2026', internal_link_targets: ['/collections/slow-feeder-dog-bowls'] },
      { keyword: 'slow feeder bowl benefits', intent: 'informational', estimated_volume_range: '100–1K', target_page: '/guides/best-slow-feeder-dog-bowls-2026', internal_link_targets: ['/collections/slow-feeder-dog-bowls'] },
      { keyword: 'bloat prevention dog bowl', intent: 'transactional', estimated_volume_range: '100–1K', target_page: '/collections/slow-feeder-dog-bowls', internal_link_targets: [] },
      { keyword: 'slow feeder for puppies', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/slow-feeder-dog-bowls', internal_link_targets: [] },
      { keyword: 'stainless steel slow feeder', intent: 'transactional', estimated_volume_range: '100–1K', target_page: '/collections/slow-feeder-dog-bowls', internal_link_targets: [] },
      { keyword: 'interactive dog feeder', intent: 'transactional', estimated_volume_range: '1K–10K', target_page: '/collections/slow-feeder-dog-bowls', internal_link_targets: [] },
      { keyword: 'do slow feeders work for dogs', intent: 'informational', estimated_volume_range: '1K–10K', target_page: '/guides/best-slow-feeder-dog-bowls-2026', internal_link_targets: ['/collections/slow-feeder-dog-bowls'] },
    ],
  },
];

/**
 * Get niche config by ID
 */
export function getNicheConfig(id: string): NicheConfig | undefined {
  return NICHE_KEYWORD_RESEARCH.find(n => n.id === id);
}

/**
 * Get all niche configs
 */
export function getAllNiches(): NicheConfig[] {
  return NICHE_KEYWORD_RESEARCH;
}

/**
 * Get all transactional keywords across niches (for collection page optimization)
 */
export function getTransactionalKeywords(): NicheKeyword[] {
  return NICHE_KEYWORD_RESEARCH.flatMap(n =>
    n.supporting_keywords.filter(k => k.intent === 'transactional')
  );
}

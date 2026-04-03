/**
 * SEO Keyword Cannibalization Detection
 * 
 * Enforces intent hierarchy:
 * - Head terms → Pillar pages (/collections/pillar-slug)
 * - Mid-tail → Sub-collection pages (/collections/sub-slug)
 * - Long-tail / Question → Blog articles (/blog/slug)
 * - Transactional exact-match → Product pages (/product/slug)
 * 
 * Detects overlapping ranking intent between page types.
 */

export type PageType = 'pillar' | 'collection' | 'blog' | 'product';

export interface PageKeywordMapping {
  url: string;
  pageType: PageType;
  primaryKeyword: string;
  secondaryKeywords: string[];
}

export interface CannibalizationRisk {
  keyword: string;
  pages: { url: string; pageType: PageType }[];
  severity: 'high' | 'medium' | 'low';
  recommendation: string;
}

/**
 * Detect keyword cannibalization across page mappings.
 */
export function detectCannibalization(
  mappings: PageKeywordMapping[]
): CannibalizationRisk[] {
  const keywordPages = new Map<string, { url: string; pageType: PageType }[]>();

  // Build keyword → pages index
  for (const mapping of mappings) {
    const kw = mapping.primaryKeyword.toLowerCase().trim();
    if (!keywordPages.has(kw)) keywordPages.set(kw, []);
    keywordPages.get(kw)!.push({ url: mapping.url, pageType: mapping.pageType });

    for (const sec of mapping.secondaryKeywords) {
      const sk = sec.toLowerCase().trim();
      if (!keywordPages.has(sk)) keywordPages.set(sk, []);
      keywordPages.get(sk)!.push({ url: mapping.url, pageType: mapping.pageType });
    }
  }

  const risks: CannibalizationRisk[] = [];

  for (const [keyword, pages] of keywordPages) {
    if (pages.length < 2) continue;

    // Dedupe by URL
    const unique = Array.from(new Map(pages.map(p => [p.url, p])).values());
    if (unique.length < 2) continue;

    const pageTypes = new Set(unique.map(p => p.pageType));

    // Same page type competing = high risk
    // Different types competing = check hierarchy
    let severity: 'high' | 'medium' | 'low' = 'low';
    let recommendation = '';

    if (pageTypes.size === 1) {
      // Two pages of same type targeting same keyword
      severity = 'high';
      const type = unique[0].pageType;
      recommendation = type === 'collection'
        ? `Merge these collections or differentiate with mid-tail modifiers.`
        : type === 'blog'
          ? `Consolidate into one comprehensive article and 301-redirect the weaker one.`
          : `Differentiate product titles with model/feature/modifier keywords.`;
    } else if (pageTypes.has('blog') && pageTypes.has('collection')) {
      severity = 'medium';
      recommendation = `Blog and collection targeting same term. Rewrite blog title to question-based long-tail. Collection owns the commercial intent.`;
    } else if (pageTypes.has('pillar') && pageTypes.has('collection')) {
      severity = 'medium';
      recommendation = `Pillar and sub-collection overlap. Ensure pillar targets head term; sub-collection targets mid-tail variation.`;
    } else {
      severity = 'low';
      recommendation = `Minor overlap. Ensure each page targets a distinct search intent (informational vs commercial vs transactional).`;
    }

    risks.push({ keyword, pages: unique, severity, recommendation });
  }

  // Sort by severity
  const severityOrder = { high: 0, medium: 1, low: 2 };
  return risks.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/**
 * Get the correct page type for a keyword based on intent hierarchy.
 */
export function getIdealPageType(keyword: string): PageType {
  const kw = keyword.toLowerCase();

  // Question-based → Blog
  if (/^(how|why|what|when|where|is|are|do|does|can|should)\b/.test(kw)) {
    return 'blog';
  }

  // Transactional exact-match → Product
  if (/^(buy|order|shop|get)\b/.test(kw) || kw.split(' ').length >= 5) {
    return 'product';
  }

  // Head terms (1-2 words) → Pillar
  if (kw.split(' ').length <= 2) {
    return 'pillar';
  }

  // Mid-tail (3-4 words) → Collection
  return 'collection';
}

/**
 * Known cannibalization risks for GetPawsy (static analysis).
 */
export const KNOWN_RISKS: CannibalizationRisk[] = [
  {
    keyword: 'best dog beds',
    pages: [
      { url: '/collections/dog-beds', pageType: 'pillar' },
      { url: '/blog/best-orthopedic-dog-beds-2026', pageType: 'blog' },
    ],
    severity: 'medium',
    recommendation: 'Blog should target "best orthopedic dog beds 2026 review" (long-tail with year + intent). Pillar owns "best dog beds".',
  },
  {
    keyword: 'interactive dog toys',
    pages: [
      { url: '/collections/best-interactive-dog-toys', pageType: 'pillar' },
      { url: '/collections/dog-enrichment-toys', pageType: 'collection' },
    ],
    severity: 'medium',
    recommendation: 'Differentiate: pillar = "interactive dog toys", sub-collection = "dog enrichment & puzzle toys". Avoid identical H1s.',
  },
  {
    keyword: 'cat litter box',
    pages: [
      { url: '/collections/cat-litter-boxes', pageType: 'pillar' },
      { url: '/blog/cat-litter-box-problems-solutions', pageType: 'blog' },
    ],
    severity: 'low',
    recommendation: 'Good intent separation. Blog targets informational "cat litter box problems", pillar targets commercial "best cat litter boxes".',
  },
  {
    keyword: 'calming dog bed',
    pages: [
      { url: '/collections/dog-beds', pageType: 'pillar' },
      { url: '/collections/dog-beds-for-anxiety', pageType: 'collection' },
    ],
    severity: 'medium',
    recommendation: 'Pillar targets "best dog beds" (head). Sub-collection differentiates with "anxiety relief dog beds" or "dog beds for anxious dogs".',
  },
  {
    keyword: 'orthopedic dog bed',
    pages: [
      { url: '/collections/dog-beds', pageType: 'pillar' },
      { url: '/collections/best-orthopedic-dog-beds', pageType: 'collection' },
      { url: '/blog/best-dog-bed-for-hip-dysplasia', pageType: 'blog' },
    ],
    severity: 'medium',
    recommendation: 'Pillar owns head term "orthopedic dog beds". Sub-collection targets "best orthopedic dog beds [year]". Blog targets "dog beds for hip dysplasia" (condition-specific long-tail).',
  },
  {
    keyword: 'cat tree',
    pages: [
      { url: '/collections/cat-condos', pageType: 'pillar' },
      { url: '/collections/modern-cat-trees', pageType: 'collection' },
      { url: '/blog/best-cat-trees-guide', pageType: 'blog' },
    ],
    severity: 'medium',
    recommendation: 'Pillar owns "cat condos & cat trees". Sub-collection differentiates with "modern cat trees". Blog targets "how to choose a cat tree" (informational).',
  },
  {
    keyword: 'dog car seat',
    pages: [
      { url: '/collections/dog-car-travel-safety-seats', pageType: 'collection' },
      { url: '/collections/best-dog-car-seats', pageType: 'collection' },
    ],
    severity: 'high',
    recommendation: 'Merge these two collections or 301-redirect "dog-car-travel-safety-seats" to "best-dog-car-seats". One canonical URL per intent.',
  },
  {
    keyword: 'slow feeder dog bowl',
    pages: [
      { url: '/collections/best-slow-feeder-dog-bowls', pageType: 'pillar' },
      { url: '/collections/best-slow-feeder-for-dogs-who-eat-too-fast', pageType: 'collection' },
    ],
    severity: 'medium',
    recommendation: 'Pillar owns "slow feeder dog bowls". Sub-collection must differentiate with specific modifier: "for fast eaters" or "anti-bloat bowls".',
  },
];

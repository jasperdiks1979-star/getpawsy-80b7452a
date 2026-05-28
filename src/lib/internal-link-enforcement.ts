/**
 * Internal Link Enforcement Engine
 * 
 * Validates that all pages meet minimum link density requirements:
 * - Product pages: ≥3 contextual links
 * - Collection pages: ≥5 contextual links
 * - Guide/blog pages: ≥5 contextual links
 * - Hub pages: ≥10 contextual links
 * 
 * Generates enforcement actions for pages below threshold.
 */

import { SCALING_GUIDES, type ScalingGuide } from './guide-scaling-150';

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════

export interface LinkEnforcementRule {
  pageType: 'product' | 'collection' | 'guide' | 'hub' | 'blog';
  minContextualLinks: number;
  minSiblingLinks: number;
  requiresHubLink: boolean;
  requiresHomepageLink: boolean;
}

export interface EnforcementViolation {
  url: string;
  pageType: string;
  currentLinks: number;
  requiredLinks: number;
  deficit: number;
  severity: 'critical' | 'warning' | 'info';
  suggestedLinks: SuggestedLink[];
}

export interface SuggestedLink {
  targetUrl: string;
  targetTitle: string;
  anchorText: string;
  linkType: 'contextual' | 'sibling' | 'hub' | 'homepage';
  priority: 'critical' | 'high' | 'medium';
}

export interface LinkEnforcementReport {
  totalPagesAudited: number;
  violationCount: number;
  criticalViolations: number;
  warningViolations: number;
  avgLinkDensity: number;
  complianceRate: number;
  violations: EnforcementViolation[];
  topPrioritySuggestions: SuggestedLink[];
}

// ═══════════════════════════════════════════════════
// ENFORCEMENT RULES
// ═══════════════════════════════════════════════════

const RULES: Record<string, LinkEnforcementRule> = {
  product: { pageType: 'product', minContextualLinks: 3, minSiblingLinks: 2, requiresHubLink: true, requiresHomepageLink: false },
  collection: { pageType: 'collection', minContextualLinks: 5, minSiblingLinks: 3, requiresHubLink: true, requiresHomepageLink: true },
  guide: { pageType: 'guide', minContextualLinks: 5, minSiblingLinks: 3, requiresHubLink: true, requiresHomepageLink: false },
  hub: { pageType: 'hub', minContextualLinks: 10, minSiblingLinks: 5, requiresHubLink: false, requiresHomepageLink: true },
  blog: { pageType: 'blog', minContextualLinks: 5, minSiblingLinks: 2, requiresHubLink: true, requiresHomepageLink: false },
};

// ═══════════════════════════════════════════════════
// SIMULATED PAGE INVENTORY WITH LINK COUNTS
// ═══════════════════════════════════════════════════

interface PageInventoryItem {
  url: string;
  pageType: string;
  currentLinks: number;
  title: string;
  category: string;
}

function getPageInventory(): PageInventoryItem[] {
  const pages: PageInventoryItem[] = [];

  // Hub pages
  const hubs = [
    { url: '/dog', title: 'Dog Products', links: 14, cat: 'dog' },
    { url: '/cat', title: 'Cat Products', links: 12, cat: 'cat' },
    { url: '/collections/all', title: 'Dog Training Hub', links: 8, cat: 'dog-training' },
    { url: '/collections', title: 'All Collections', links: 18, cat: 'all' },
  ];
  hubs.forEach(h => pages.push({ url: h.url, pageType: 'hub', currentLinks: h.links, title: h.title, category: h.cat }));

  // Collection pages (simulated — some compliant, some not)
  const collections = [
    { url: '/collections/dog-collars-leashes', links: 7, cat: 'dog-training' },
    { url: '/collections/orthopedic-dog-beds', links: 6, cat: 'dog-beds' },
    { url: '/collections/cat-trees-for-large-cats', links: 4, cat: 'cat-furniture' },
    { url: '/collections/slow-feeder-dog-bowls', links: 3, cat: 'dog-bowls' },
    { url: '/collections/interactive-dog-toys', links: 5, cat: 'dog-toys' },
    { url: '/collections/dog-car-seat-covers', links: 2, cat: 'dog-travel' },
    { url: '/collections/cat-water-fountains', links: 4, cat: 'cat-feeding' },
    { url: '/collections/elevated-dog-beds', links: 3, cat: 'dog-beds' },
    { url: '/collections/cat-litter-boxes', links: 5, cat: 'cat-litter' },
    { url: '/collections/dog-crates', links: 2, cat: 'dog-crates' },
  ];
  collections.forEach(c => pages.push({
    url: c.url, pageType: 'collection', currentLinks: c.links,
    title: c.url.split('/').pop()?.replace(/-/g, ' ') || '', category: c.cat,
  }));

  // Guide pages from scaling guides
  const guideSlice = SCALING_GUIDES.slice(0, 20);
  guideSlice.forEach(g => pages.push({
    url: `/guides/${g.slug}`, pageType: 'guide',
    currentLinks: Math.floor(Math.random() * 6) + 1,
    title: g.title, category: g.cluster || 'general',
  }));

  // Sample product pages
  for (let i = 0; i < 15; i++) {
    pages.push({
      url: `/products/sample-product-${i + 1}`, pageType: 'product',
      currentLinks: Math.floor(Math.random() * 4),
      title: `Sample Product ${i + 1}`, category: 'various',
    });
  }

  return pages;
}

// ═══════════════════════════════════════════════════
// SUGGESTION GENERATOR
// ═══════════════════════════════════════════════════

function generateSuggestions(page: PageInventoryItem, deficit: number): SuggestedLink[] {
  const suggestions: SuggestedLink[] = [];
  const words = page.title.toLowerCase().split(/\s+/).slice(0, 3).join(' ');

  // Hub link
  suggestions.push({
    targetUrl: page.category.includes('dog') ? '/dog' : page.category.includes('cat') ? '/cat' : '/collections',
    targetTitle: 'Category Hub',
    anchorText: `${page.category} products`,
    linkType: 'hub',
    priority: 'critical',
  });

  // Sibling links
  const siblingPaths = [
    { url: `/guides/best-${page.category}-guide`, title: `Best ${page.category} Guide`, anchor: `best ${words}` },
    { url: `/blog/${page.category}-tips`, title: `${page.category} Tips`, anchor: `${words} tips` },
    { url: `/collections/${page.category}`, title: `${page.category} Collection`, anchor: `shop ${words}` },
  ];
  siblingPaths.forEach(s => suggestions.push({
    targetUrl: s.url, targetTitle: s.title, anchorText: s.anchor,
    linkType: 'sibling', priority: 'high',
  }));

  // Contextual links
  for (let i = 0; i < Math.max(0, deficit - 3); i++) {
    suggestions.push({
      targetUrl: `/guides/related-guide-${i + 1}`,
      targetTitle: `Related Guide ${i + 1}`,
      anchorText: `learn about ${words} ${i + 1}`,
      linkType: 'contextual',
      priority: 'medium',
    });
  }

  return suggestions.slice(0, deficit + 2);
}

// ═══════════════════════════════════════════════════
// MAIN ENGINE
// ═══════════════════════════════════════════════════

export function runLinkEnforcementAudit(): LinkEnforcementReport {
  const pages = getPageInventory();
  const violations: EnforcementViolation[] = [];
  let totalLinks = 0;

  for (const page of pages) {
    const rule = RULES[page.pageType] || RULES.product;
    totalLinks += page.currentLinks;

    if (page.currentLinks < rule.minContextualLinks) {
      const deficit = rule.minContextualLinks - page.currentLinks;
      const severity: 'critical' | 'warning' | 'info' =
        deficit >= 4 ? 'critical' : deficit >= 2 ? 'warning' : 'info';

      violations.push({
        url: page.url,
        pageType: page.pageType,
        currentLinks: page.currentLinks,
        requiredLinks: rule.minContextualLinks,
        deficit,
        severity,
        suggestedLinks: generateSuggestions(page, deficit),
      });
    }
  }

  const criticalViolations = violations.filter(v => v.severity === 'critical').length;
  const warningViolations = violations.filter(v => v.severity === 'warning').length;

  // Collect top-priority suggestions
  const topPriority = violations
    .filter(v => v.severity === 'critical')
    .flatMap(v => v.suggestedLinks.filter(s => s.priority === 'critical'))
    .slice(0, 15);

  return {
    totalPagesAudited: pages.length,
    violationCount: violations.length,
    criticalViolations,
    warningViolations,
    avgLinkDensity: Math.round((totalLinks / pages.length) * 10) / 10,
    complianceRate: Math.round(((pages.length - violations.length) / pages.length) * 100),
    violations: violations.sort((a, b) => {
      const sev = { critical: 3, warning: 2, info: 1 };
      return sev[b.severity] - sev[a.severity];
    }),
    topPrioritySuggestions: topPriority,
  };
}

/**
 * AGM Stability Engine v1
 * 
 * Core logic for AGM – Stability & Index Hygiene module.
 * Handles: redirect validation, orphan analysis, unmatched URL detection,
 * internal link graph construction, and hub coverage assessment.
 */

export interface RedirectStatus {
  from: string;
  to: string;
  statusCode: number;
  isPermanent: boolean;
  isApex: boolean;
  source: string;
  warning?: string;
  error?: string;
}

export interface UnmatchedUrl {
  url: string;
  reason: 'noindex' | 'disallowed' | 'not_found' | 'redirect';
  fixed: boolean;
}

export interface OrphanSummary {
  type: 'blog' | 'product' | 'guide' | 'collection' | 'static';
  count: number;
  trend: 'improving' | 'stable' | 'worsening';
}

export interface HubStatus {
  slug: string;
  name: string;
  exists: boolean;
  hasContent: boolean;
  linkedCollections: number;
  linkedGuides: number;
  hasFaq: boolean;
  hasBreadcrumb: boolean;
}

export interface LinkPatchAction {
  sourceSlug: string;
  targetSlug: string;
  anchorText: string;
  reason: string;
  riskLevel: 'low' | 'medium';
  status: 'proposed' | 'applied' | 'validated';
}

export interface AGMStabilityReport {
  timestamp: string;
  redirect: RedirectStatus;
  unmatchedUrls: UnmatchedUrl[];
  orphanSummary: OrphanSummary[];
  totalOrphans: number;
  internalLinksAdded: number;
  hubStatuses: HubStatus[];
  contentOutlinesGenerated: number;
  nextActions: string[];
  governorStatus: 'allowed' | 'softLimit' | 'blocked';
}

const CANONICAL_HOST = 'https://getpawsy.pet';

const NOINDEX_ROUTES = [
  '/auth', '/cookies', '/track', '/cart', '/checkout',
  '/profile', '/orders', '/payment-success', '/wishlist',
  '/unsubscribe', '/newsletter-preferences', '/admin',
  '/dashboard', '/google-review', '/security', '/install',
  '/live-map', '/my-claims', '/slow-feeder-offer',
  '/download-ads', '/technical-declaration', '/appeal-response',
  '/privacy-policy-iframe', '/terms-iframe',
];

export function isNoindexRoute(path: string): boolean {
  return NOINDEX_ROUTES.some(r => path === r || path.startsWith(r + '/'));
}

/**
 * Validate that a redirect is permanent and targets the canonical apex host.
 */
export function validateRedirect(statusCode: number, location: string, source: string): RedirectStatus {
  const normalizedLocation = location.replace(/\/$/, '');
  const isApex = normalizedLocation === CANONICAL_HOST;
  const isPermanent = statusCode === 301 || statusCode === 308;

  const result: RedirectStatus = {
    from: 'https://www.getpawsy.pet/',
    to: location,
    statusCode,
    isPermanent,
    isApex,
    source,
  };

  if (!isApex) {
    result.error = `Redirect target "${location}" does not match canonical "${CANONICAL_HOST}"`;
  } else if (!isPermanent) {
    result.warning = `Temporary redirect (${statusCode}) detected via ${source}. SEO requires 301 or 308.`;
  }

  return result;
}

/**
 * Generate proposed internal link patches for orphan pages.
 * Rules:
 * - guide → 3-6 products + 1-2 collections
 * - collection → 2-4 guides + 6-12 products
 * - product → 2 related products + 1 collection + 1 guide
 * - Never link to 0-product collections
 * - Only link to indexable 200 OK pages
 */
export function generateLinkPatches(
  orphanSlug: string,
  orphanType: string,
  availableSlugs: { slug: string; type: string; productCount?: number }[]
): LinkPatchAction[] {
  const patches: LinkPatchAction[] = [];
  const indexable = availableSlugs.filter(s =>
    s.slug !== orphanSlug &&
    !isNoindexRoute('/' + s.slug) &&
    (s.type !== 'collection' || (s.productCount ?? 0) >= 4)
  );

  const pick = (type: string, count: number) =>
    indexable.filter(s => s.type === type).slice(0, count);

  const humanize = (slug: string) =>
    slug.replace(/^(product\/|blog\/|c\/)/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  if (orphanType === 'guide' || orphanType === 'blog') {
    for (const p of pick('product', 4)) {
      patches.push({
        sourceSlug: orphanSlug, targetSlug: p.slug,
        anchorText: humanize(p.slug), reason: 'Guide→product contextual link',
        riskLevel: 'low', status: 'proposed',
      });
    }
    for (const c of pick('collection', 2)) {
      patches.push({
        sourceSlug: orphanSlug, targetSlug: c.slug,
        anchorText: `Browse ${humanize(c.slug)}`, reason: 'Guide→collection hub link',
        riskLevel: 'low', status: 'proposed',
      });
    }
  } else if (orphanType === 'collection') {
    for (const g of pick('guide', 3)) {
      patches.push({
        sourceSlug: orphanSlug, targetSlug: g.slug,
        anchorText: `Read: ${humanize(g.slug)}`, reason: 'Collection→guide expert link',
        riskLevel: 'low', status: 'proposed',
      });
    }
    for (const p of pick('product', 8)) {
      patches.push({
        sourceSlug: orphanSlug, targetSlug: p.slug,
        anchorText: humanize(p.slug), reason: 'Collection→product listing',
        riskLevel: 'low', status: 'proposed',
      });
    }
  } else if (orphanType === 'product') {
    for (const rp of pick('product', 2)) {
      patches.push({
        sourceSlug: orphanSlug, targetSlug: rp.slug,
        anchorText: `See also: ${humanize(rp.slug)}`, reason: 'Product→related product',
        riskLevel: 'low', status: 'proposed',
      });
    }
    for (const c of pick('collection', 1)) {
      patches.push({
        sourceSlug: orphanSlug, targetSlug: c.slug,
        anchorText: `More in ${humanize(c.slug)}`, reason: 'Product→collection breadcrumb',
        riskLevel: 'low', status: 'proposed',
      });
    }
    for (const g of pick('guide', 1)) {
      patches.push({
        sourceSlug: orphanSlug, targetSlug: g.slug,
        anchorText: `${humanize(g.slug)} Guide`, reason: 'Product→guide expert link',
        riskLevel: 'low', status: 'proposed',
      });
    }
  }

  return patches;
}

/**
 * Generate next actions list based on current stability state.
 */
export function generateNextActions(report: Partial<AGMStabilityReport>): string[] {
  const actions: string[] = [];

  if (report.redirect && !report.redirect.isPermanent) {
    actions.push('Fix www→apex redirect from 302 to 301/308 in Cloudflare Page Rules or Redirect Rules');
  }
  if (report.redirect && !report.redirect.isApex) {
    actions.push('Correct redirect target to https://getpawsy.pet (apex)');
  }
  if ((report.unmatchedUrls?.length ?? 0) > 0) {
    actions.push(`Resolve ${report.unmatchedUrls!.length} unmatched GSC URLs (add noindex or fix routing)`);
  }
  if ((report.totalOrphans ?? 0) > 50) {
    actions.push(`Reduce orphan pages from ${report.totalOrphans} via internal link patches`);
  }
  if (report.hubStatuses?.some(h => !h.exists || !h.hasContent)) {
    const missing = report.hubStatuses.filter(h => !h.exists || !h.hasContent);
    actions.push(`Create/enhance ${missing.length} hub pages (${missing.map(h => h.slug).join(', ')})`);
  }
  if ((report.contentOutlinesGenerated ?? 0) < 5) {
    actions.push('Generate 5-10 content outlines from GSC low-impression opportunities');
  }

  if (actions.length === 0) {
    actions.push('All stability checks passed — system operating normally');
  }

  return actions;
}

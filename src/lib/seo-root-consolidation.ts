/**
 * Root-level SEO landing pages that duplicate an established /guides page.
 * Each source path redirects (client) and gets a raw-HTML stub (build) with
 * noindex,follow + canonical to the target, so signals consolidate on the
 * guide that is in the sitemap. Targets must be indexable sitemap guides.
 */
export const ROOT_GUIDE_CONSOLIDATION: Readonly<Record<string, string>> = {
  '/best-cat-litter-box-2026': '/guides/best-cat-litter-box-2026',
  '/best-cat-litter-box-reddit': '/guides/best-cat-litter-box-2026',
  '/best-litter-boxes-apartments-2026': '/guides/best-litter-boxes-apartments-2026',
  '/best-litter-box-for-smell': '/guides/best-odor-control-litter-box',
  '/best-litter-box-large-cats': '/guides/best-extra-large-litter-boxes',
  '/best-self-cleaning-litter-box-2026': '/guides/best-self-cleaning-litter-box-2026',
  '/best-interactive-cat-toys': '/guides/best-interactive-cat-toys-that-work',
};

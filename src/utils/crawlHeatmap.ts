/**
 * Dev-only crawl heatmap logger.
 * Counts internal links on the page for SEO diagnostics.
 * No analytics, no external requests, no tracking pixels.
 */
export function logHomepageCrawlStats() {
  if (import.meta.env.PROD) return;

  requestAnimationFrame(() => {
    const productLinks = document.querySelectorAll('a[href^="/product/"]');
    const collectionLinks = document.querySelectorAll('a[href^="/collections/"]');
    const guideLinks = document.querySelectorAll('a[href^="/guides/"]');
    const blogLinks = document.querySelectorAll('a[href^="/blog/"]');

    const total = productLinks.length + collectionLinks.length + guideLinks.length + blogLinks.length;

    console.log(
      `%c[CrawlHeatmap]%c Homepage internal links: ${total}`,
      'color: #f59e0b; font-weight: bold',
      'color: inherit',
    );
    console.table({
      '/product/*': productLinks.length,
      '/collections/*': collectionLinks.length,
      '/guides/*': guideLinks.length,
      '/blog/*': blogLinks.length,
      total,
    });
  });
}

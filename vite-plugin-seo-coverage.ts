/**
 * Vite Plugin: SEO prerender coverage gate.
 * Runs after every prerender plugin (sequential closeBundle) and fails the
 * build if any sitemap URL lacks dist/<path>/index.html, so the sitemap and
 * prerendered HTML can never diverge silently.
 */
import path from 'path';
import type { Plugin } from 'vite';
import { findUnrenderedSitemapPaths, findNonIndexableSitemapPaths, findUnadvertisedIndexablePages } from './vite-plugin-prerender-guides';

export const COVERED_SITEMAPS = [
  'sitemap-guides.xml', 'sitemap-blog.xml', 'sitemap-collections.xml', 'sitemap-pages.xml', 'sitemap-products-1.xml',
];

export default function seoCoveragePlugin(): Plugin {
  return {
    name: 'seo-prerender-coverage',
    apply: 'build',
    enforce: 'post',
    closeBundle: {
      sequential: true,
      order: 'post',
      async handler() {
        const distDir = path.resolve('dist');
        const problems: string[] = [];
        for (const f of COVERED_SITEMAPS) {
          const missing = findUnrenderedSitemapPaths(distDir, f);
          if (missing.length) problems.push(`${f}: ${missing.length} without HTML (${missing.slice(0, 5).join(', ')})`);
          const bad = findNonIndexableSitemapPaths(distDir, f);
          if (bad.length) problems.push(`${f}: ${bad.length} noindex/non-self-canonical (${bad.slice(0, 5).join(', ')})`);
        }
        // Reverse direction: every indexable prerendered guide/blog page is advertised.
        for (const [dir, file] of [['guides', 'sitemap-guides.xml'], ['blog', 'sitemap-blog.xml']] as const) {
          const orphans = findUnadvertisedIndexablePages(distDir, dir, file);
          if (orphans.length) problems.push(`${dir}: ${orphans.length} indexable pages missing from ${file} (${orphans.slice(0, 5).join(', ')})`);
        }
        if (problems.length) throw new Error(`[seo-coverage] FATAL sitemap/prerender divergence:\n  ${problems.join('\n  ')}`);
        console.log(`[seo-coverage] ✅ Every URL in ${COVERED_SITEMAPS.length} sitemaps has prerendered HTML`);
      },
    },
  };
}

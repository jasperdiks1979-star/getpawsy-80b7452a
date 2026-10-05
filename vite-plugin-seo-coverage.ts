/**
 * Vite Plugin: SEO prerender coverage gate.
 * Runs after every prerender plugin (sequential closeBundle) and fails the
 * build if any sitemap URL lacks dist/<path>/index.html, so the sitemap and
 * prerendered HTML can never diverge silently.
 */
import path from 'path';
import type { Plugin } from 'vite';
import { findUnrenderedSitemapPaths } from './vite-plugin-prerender-guides';

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
        }
        if (problems.length) throw new Error(`[seo-coverage] FATAL sitemap/prerender divergence:\n  ${problems.join('\n  ')}`);
        console.log(`[seo-coverage] ✅ Every URL in ${COVERED_SITEMAPS.length} sitemaps has prerendered HTML`);
      },
    },
  };
}

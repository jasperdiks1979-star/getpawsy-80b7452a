/**
 * Vite plugin that generates sitemap XML files at build time
 * by fetching from the Supabase edge function.
 * Falls back to a minimal valid index if the fetch fails.
 */
import type { Plugin } from 'vite';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const EDGE_URL = 'https://nojvgfbcjgipjxpfatmm.supabase.co/functions/v1/sitemap-xml';
const SITEMAP_TYPES = ['index', 'static', 'products', 'categories', 'bestsellers', 'collections', 'blog', 'guides'];

const FALLBACK_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://getpawsy.pet/sitemap-static.xml</loc></sitemap>
  <sitemap><loc>https://getpawsy.pet/sitemap-products.xml</loc></sitemap>
  <sitemap><loc>https://getpawsy.pet/sitemap-categories.xml</loc></sitemap>
  <sitemap><loc>https://getpawsy.pet/sitemap-bestsellers.xml</loc></sitemap>
  <sitemap><loc>https://getpawsy.pet/sitemap-collections.xml</loc></sitemap>
  <sitemap><loc>https://getpawsy.pet/sitemap-blog.xml</loc></sitemap>
  <sitemap><loc>https://getpawsy.pet/sitemap-guides.xml</loc></sitemap>
</sitemapindex>`;

const FALLBACK_EMPTY = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>`;

function fileName(type: string): string {
  return type === 'index' ? 'sitemap.xml' : `sitemap-${type}.xml`;
}

export default function sitemapPlugin(): Plugin {
  return {
    name: 'generate-sitemaps',
    apply: 'build',
    async closeBundle() {
      // Write to public/ directory so files are available at root
      // Vite copies public/ contents to dist/ during build
      const outDir = 'public';
      mkdirSync(outDir, { recursive: true });

      console.log('[sitemap-plugin] Generating sitemap XML files...');

      const results = await Promise.allSettled(
        SITEMAP_TYPES.map(async (type) => {
          try {
            const res = await fetch(`${EDGE_URL}?type=${type}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const xml = await res.text();
            // Basic validation: must start with <?xml
            if (!xml.trim().startsWith('<?xml')) throw new Error('Invalid XML response');
            return { type, xml };
          } catch (err) {
            console.warn(`[sitemap-plugin] Failed to fetch ${type}:`, err);
            return { type, xml: type === 'index' ? FALLBACK_INDEX : FALLBACK_EMPTY };
          }
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { type, xml } = result.value;
          const filePath = join(outDir, fileName(type));
          writeFileSync(filePath, xml, 'utf-8');
          console.log(`[sitemap-plugin] ✓ ${fileName(type)} (${xml.length} bytes)`);
        }
      }

      console.log('[sitemap-plugin] Done.');
    },
  };
}

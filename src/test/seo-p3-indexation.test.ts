import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ROOT_GUIDE_CONSOLIDATION } from '@/lib/seo-root-consolidation';
import { buildCanonicalUrl } from '@/lib/seo-canonical';
import { getRobotsDirective } from '@/lib/seo-robots-policy';
import { GUIDE_REDIRECTS } from '@/lib/guide-consolidation';
import { buildConsolidationStub } from '../../vite-plugin-prerender-guides';

const sitemapGuides = readFileSync('public/sitemap-guides.xml', 'utf8');
const spa = readFileSync('index.html', 'utf8');

describe('root duplicate guides consolidate on the /guides page', () => {
  for (const [src, to] of Object.entries(ROOT_GUIDE_CONSOLIDATION)) {
    it(`${src} → ${to}`, () => {
      expect(sitemapGuides).toContain(`<loc>https://getpawsy.pet${to}</loc>`);
      expect(buildCanonicalUrl(src)).toBe(`https://getpawsy.pet${to}`);
      expect(getRobotsDirective(src)).toBe('noindex-follow');
      expect(to.slice('/guides/'.length) in GUIDE_REDIRECTS).toBe(false);
    });
  }
  it('target guides stay indexable and self-canonical', () => {
    expect(getRobotsDirective('/guides/best-cat-litter-box-2026')).toBe('index');
    expect(buildCanonicalUrl('/guides/best-cat-litter-box-2026')).toBe('https://getpawsy.pet/guides/best-cat-litter-box-2026');
  });
});

describe('consolidation stub raw HTML', () => {
  const html = buildConsolidationStub(spa, '/guides/best-enrichment');
  it('has exactly one canonical pointing at the target and noindex,follow', () => {
    expect(html.match(/rel="canonical"/g)?.length).toBe(1);
    expect(html).toContain('href="https://getpawsy.pet/guides/best-enrichment"');
    expect(html).toContain('<meta name="robots" content="noindex, follow" />');
    expect(html).toContain('<meta name="googlebot" content="noindex, follow" />');
  });
  it('the inline head script keeps a prerendered canonical instead of overwriting it', () => {
    expect(spa).toMatch(/if \(el && el\.getAttribute\('href'\)\) canonical = el\.getAttribute\('href'\)/);
  });
  it('the non-indexed cat-toy guide is a consolidation source', () => {
    expect(GUIDE_REDIRECTS['cat-toys-for-mental-stimulation']).toBe('best-cat-enrichment-ideas-indoor-cats-2026');
  });
});

describe('/products hub crawl paths', () => {
  it('links indexable collections and the guides hub', () => {
    const s = readFileSync('vite-plugin-prerender-products.ts', 'utf8');
    expect(s).toContain('categories: productsHubCategoryLinks(safeProducts)');
    expect(s).toContain("href: '/guides'");
  });
});

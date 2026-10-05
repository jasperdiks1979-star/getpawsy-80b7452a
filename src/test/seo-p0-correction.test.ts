import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  dbGuideToJson, mergeGuideSources, buildGuidePage, buildBlogPostPage,
  sanitizeStoredHtml, storedContentToHtml, findUnrenderedSitemapPaths,
} from '../../vite-plugin-prerender-guides';
import { isListable, isMerchVisible, collectionMembers } from '../../vite-plugin-prerender-products';
import { COVERED_SITEMAPS } from '../../vite-plugin-seo-coverage';

const SHELL = '<html><head><link rel="stylesheet" href="/a.css"></head><body><script type="module" src="/i.js"></script></body></html>';
const canon = (h: string) => [...h.matchAll(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
const h1s = (h: string) => (h.match(/<h1[\s>]/g) || []).length;

describe('DB-only guide prerender', () => {
  const row = {
    slug: 'dog-grooming-routine', title: 'Row title', excerpt: 'Row excerpt', category: 'dog', keywords: ['k'],
    published_at: '2026-01-01', updated_at: '2026-02-01', featured_image: 'https://cdn.example/x.jpg', reading_time: 4,
    guide_data: { title: 'Data title', sections: [{ heading: 'A', content: 'Body text' }] },
  };
  it('maps guide_data like useGuide()', () => {
    const g = dbGuideToJson(row);
    expect(g.title).toBe('Data title');
    expect(g.excerpt).toBe('Row excerpt');
    expect(g.updatedAt).toBe('2026-02-01');
  });
  it('static wins over DB on overlapping slugs', () => {
    const m = mergeGuideSources([{ slug: 's', title: 'static' }], [{ slug: 's', title: 'db' }, { slug: 'd', title: 'db only' }]);
    expect(m.get('s')!.title).toBe('static');
    expect(m.has('d')).toBe(true);
  });
  it('renders DB guide with one canonical, one H1, absolute image untouched', () => {
    const html = buildGuidePage(dbGuideToJson(row), SHELL, true);
    expect(canon(html)).toEqual(['https://getpawsy.pet/guides/dog-grooming-routine']);
    expect(h1s(html)).toBe(1);
    expect(html).not.toContain('https://getpawsy.pethttps');
  });
});

describe('blog article prerender', () => {
  const post = {
    slug: 'leash-training', title: 'Leash Training', meta_title: null, meta_description: 'desc', excerpt: 'ex',
    content: '# Heading\n\nSome **text**.\n\n<script>alert(1)</script>', author_name: 'GetPawsy Editorial',
    published_at: '2026-01-01T00:00:00Z', updated_at: null, featured_image: 'https://cdn.example/a.jpg', category: null,
  };
  const html = buildBlogPostPage(post, SHELL);
  it('has one canonical, one H1, index robots, Article + Breadcrumb schema, og:url', () => {
    expect(canon(html)).toEqual(['https://getpawsy.pet/blog/leash-training']);
    expect(h1s(html)).toBe(1);
    expect(html).toContain('content="index, follow');
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('og:url" content="https://getpawsy.pet/blog/leash-training"');
  });
  it('strips scripts from stored content', () => {
    expect(html).not.toContain('alert(1)');
  });
  it('sanitizer removes handlers, javascript: urls, iframes and demotes h1', () => {
    const out = sanitizeStoredHtml('<h1>x</h1><a href="javascript:evil()" onclick="x()">a</a><iframe src="y"></iframe>');
    expect(out).not.toMatch(/onclick|javascript:|iframe|<h1/i);
    expect(storedContentToHtml('# T\n\nbody')).toContain('<h2>T</h2>');
  });
});

describe('merch_hidden exclusion from crawler listings', () => {
  const base = { id: '1', slug: 'a', name: 'A', description: null, price: 10, image_url: null, images: null, category: 'Cat Toys', stock: 5, is_active: true, updated_at: null };
  it('hidden products are not listable; visible are', () => {
    expect(isListable({ ...base, merch_hidden: true })).toBe(false);
    expect(isListable({ ...base, merch_hidden: false })).toBe(true);
    expect(isMerchVisible({ ...base, merch_hidden: null })).toBe(true);
  });
  it('collections exclude merch_hidden products', () => {
    const m = collectionMembers('cat-toys', [{ ...base, merch_hidden: true }, { ...base, id: '2', slug: 'b', merch_hidden: false }]);
    expect(m.map((p) => p.slug)).toEqual(['b']);
  });
  it('PDP robots policy does not reference merch_hidden', () => {
    const src = readFileSync('vite-plugin-prerender-products.ts', 'utf-8');
    const pdp = src.slice(src.indexOf('export function buildProductPage'), src.indexOf('export function buildListingPage'));
    expect(pdp).not.toContain('merch_hidden');
  });
});

describe('sitemap ↔ prerender coverage gate', () => {
  it('flags sitemap URLs without directory-index HTML', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cov-'));
    writeFileSync(join(dir, 'sitemap-blog.xml'), '<urlset><url><loc>https://getpawsy.pet/blog/a</loc></url><url><loc>https://getpawsy.pet/blog/b</loc></url></urlset>');
    mkdirSync(join(dir, 'blog', 'a'), { recursive: true });
    writeFileSync(join(dir, 'blog', 'a', 'index.html'), 'x');
    expect(findUnrenderedSitemapPaths(dir, 'sitemap-blog.xml')).toEqual(['/blog/b']);
  });
  it('covers guide and blog sitemaps and is wired into the build', () => {
    expect(COVERED_SITEMAPS).toEqual(expect.arrayContaining(['sitemap-guides.xml', 'sitemap-blog.xml']));
    expect(readFileSync('vite.config.ts', 'utf-8')).toContain('seoCoveragePlugin()');
  });
});

describe('homepage shell', () => {
  it('index.html has no crawler-visible load-failure phrase', () => {
    expect(readFileSync('index.html', 'utf-8')).not.toContain('could not finish loading');
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadSeoPolicy,
  isProductIndexable,
  assertStrictSitemapPaths,
  findRedirectMapProblems,
  normalizeProductLinks,
  CANONICAL_SITEMAP_COLLECTIONS,
} from '../../scripts/seo-indexability.mjs';
import { buildGuidePage, buildGuidesHubPage } from '../../vite-plugin-prerender-guides';
import { buildProductPage, buildListingPage } from '../../vite-plugin-prerender-products';
import { resolveCollectionRedirect } from '@/components/routing/CollectionAliasRedirect';
import { resolveToCanonical, VALID_COLLECTION_SLUGS, SLUG_ALIASES } from '@/lib/canonical-category-registry';
import { getRobotsDirective } from '@/lib/seo-robots-policy';

const policy = loadSeoPolicy();
const SHELL = '<html><head><link rel="stylesheet" href="/assets/a.css"><link rel="canonical" id="gp-canonical" /></head><body><div id="root"></div><div>GetPawsy could not finish loading.</div><script type="module" src="/assets/i.js"></script></body></html>';

function canonicals(html: string): string[] {
  return [...html.matchAll(/<link[^>]*rel=["']canonical["'][^>]*>/gi)].map((m) => (m[0].match(/href=["']([^"']*)["']/) || [])[1] ?? '');
}
function assertPrerendered(html: string, expectedCanonical: string) {
  const c = canonicals(html);
  expect(c).toEqual([expectedCanonical]);
  expect(html).not.toContain('could not finish loading');
  expect((html.match(/<h1[\s>]/g) || []).length).toBe(1);
  expect(html).toMatch(/<title>[^<]+<\/title>/);
  expect(html).toMatch(/<meta name="description" content="[^"]+"/);
  expect(html).toMatch(/<meta name="robots"/);
  expect(html).toContain(`<meta property="og:url" content="${expectedCanonical}"`);
}

const product = {
  id: '1daefaa0-7892-4760-87a9-0aa34c49c767', slug: 'steel-litter-box', name: 'Stainless Steel Litter Box',
  description: '<p>Stainless steel box with lid. Scoop and mat included.</p>', price: 96.99, image_url: 'https://x/y.jpg',
  images: null, category: 'Cat Litter Boxes', stock: 5, is_active: true, updated_at: null,
};

describe('P0 SEO: guide prerender', () => {
  const src = readFileSync('vite-plugin-prerender-guides.ts', 'utf8');
  it('writes slug/index.html, never slug.html', () => {
    expect(src).toContain("path.join(slugDir, 'index.html')");
    expect(src).not.toMatch(/writeFileSync\([^)]*`\$\{(guide\.)?slug\}\.html`/);
  });
  it('does not prerender programmatic pages', () => {
    expect(src).not.toContain('programmaticUseCases.json');
    expect(src).not.toContain('buildProgrammaticPage');
  });
  it('emits one canonical and normalizes /product/ links', () => {
    const html = buildGuidePage({ slug: 'g', title: 'Guide', excerpt: 'x', content: '<h1>Guide</h1><a href="/product/foo">f</a>' }, SHELL);
    assertPrerendered(html, 'https://getpawsy.pet/guides/g');
    expect(html).not.toContain('href="/product/');
    expect(html).toContain('href="/products/foo"');
  });
  it('noindex guides get noindex,follow', () => {
    expect(buildGuidePage({ slug: 'g', title: 'G', excerpt: 'x' }, SHELL, false)).toContain('content="noindex, follow"');
  });
  it('guides hub has its own canonical', () => {
    assertPrerendered(buildGuidesHubPage([{ slug: 'a', title: 'A' }], SHELL), 'https://getpawsy.pet/guides');
  });
});

describe('P0 SEO: product prerender', () => {
  it('Tier C / seo_noindex products are noindex,follow', () => {
    expect(isProductIndexable({ seo_tier: 'C' })).toBe(false);
    expect(isProductIndexable({ seo_noindex: true })).toBe(false);
    expect(isProductIndexable({ seo_tier: 'A', seo_noindex: false })).toBe(true);
    expect(buildProductPage({ ...product, seo_tier: 'C' }, [], SHELL)).toContain('content="noindex, follow"');
  });
  it('indexable PDP raw HTML has one canonical and no unsupported generic claims', () => {
    const html = buildProductPage({ ...product, seo_tier: 'A' }, [], SHELL);
    assertPrerendered(html, 'https://getpawsy.pet/products/steel-litter-box');
    for (const banned of [/premium quality/i, /\bbest\b/i, /self-cleaning|automatic|sensor/i, /airline/i, /weight capacity/i,
      /tested|certified/i, /joints|pressure points|hydration|calmer/i, /cheap generic/i, /fast US delivery/i, /Why pet owners choose/i]) {
      expect(html).not.toMatch(banned);
    }
    expect(html).toContain('href="/collections/cat-litter-boxes"');
  });
  it('listing pages carry breadcrumb schema and canonical', () => {
    const html = buildListingPage({ spaHtml: SHELL, path: '/collections/cat-toys', title: 'Cat Toys | GetPawsy', h1: 'Cat Toys',
      description: 'd', intro: 'i', crumbs: [{ name: 'Home', path: '/' }, { name: 'Cat Toys', path: '/collections/cat-toys' }], items: [] });
    assertPrerendered(html, 'https://getpawsy.pet/collections/cat-toys');
    expect(html).toContain('"BreadcrumbList"');
  });
});

describe('P0 SEO: strict sitemap manifest', () => {
  const ok = ['/', '/products', '/products/a', '/collections/dogs', '/guides/best-dog-bed-2026', '/blog/x'];
  it('accepts canonical paths', () => expect(() => assertStrictSitemapPaths(ok)).not.toThrow());
  it.each([
    ['/guides/best-cat-litter-box', 'guide redirect source'],
    ['/guides/how-to-choose-guinea-pig-cage', 'noindex guide'],
    ['/blog/best-cat-trees-2024', 'blog redirect source'],
    ['/collections/self-cleaning-litter-box', 'non-canonical collection'],
    ['/collections/all', 'non-canonical collection'],
    ['/product/a', 'invalid namespace'],
    ['/products/1daefaa0-7892-4760-87a9-0aa34c49c767', 'UUID'],
    ['/shop', 'non-prerendered'],
  ])('rejects %s', (p, msg) => {
    expect(() => assertStrictSitemapPaths([p])).toThrow(msg);
  });
  it('rejects noindex/Tier C products and duplicates', () => {
    expect(() => assertStrictSitemapPaths(['/products/a'], { noindexProductSlugs: new Set(['a']) })).toThrow('Tier C');
    expect(() => assertStrictSitemapPaths(['/products/a', '/products/a'])).toThrow('duplicate');
  });
  it('generator wires the strict check and indexability filters', () => {
    const gen = readFileSync('scripts/generate-sitemaps.mjs', 'utf8');
    expect(gen).toContain('assertStrictSitemapPaths(');
    expect(gen).toContain('isProductIndexable(p)');
    expect(gen).toContain('seo_tier');
    expect(gen).not.toContain('programmaticUseCases');
  });
  it('redirect maps have no self-redirects or chains', () => {
    expect(findRedirectMapProblems(policy.guideRedirects)).toEqual([]);
    expect(findRedirectMapProblems(policy.blogRedirects)).toEqual([]);
  });
  it('every guide redirect target is a real static guide', () => {
    const idx = JSON.parse(readFileSync('public/data/guides/index.json', 'utf8')) as Array<{ slug: string }>;
    const slugs = new Set(idx.map((g) => g.slug));
    const missing = Object.values(policy.guideRedirects).filter((t) => !slugs.has(t));
    // Targets that only exist in published_guides are allowed; these two never existed anywhere.
    expect(missing).not.toContain('cat-condo-vs-cat-tree-2026');
    expect(missing).not.toContain('how-tall-should-cat-tree-be');
  });
  it('locked sitemap collections are active in the registry', () => {
    for (const s of CANONICAL_SITEMAP_COLLECTIONS) expect(VALID_COLLECTION_SLUGS.has(s)).toBe(true);
    expect(resolveToCanonical('self-cleaning-litter-box')).toBe('cat-litter-boxes');
  });
});

describe('P0 SEO: collection redirects follow the registry', () => {
  it('App.tsx has no hardcoded /collections Navigate except the bare index', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    const hard = [...app.matchAll(/<Navigate to="\/collections\/([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(hard.filter((s) => s !== 'all' && !VALID_COLLECTION_SLUGS.has(s))).toEqual([]);
    for (const m of app.matchAll(/<CollectionAliasRedirect slug="([^"]+)" fallback="([^"]+)" \/>/g)) {
      const dest = resolveCollectionRedirect(m[1], m[2]).replace('/collections/', '');
      if (SLUG_ALIASES[m[1]]) expect(dest).toBe(resolveToCanonical(m[1]) ?? 'all');
      expect(dest === 'all' || VALID_COLLECTION_SLUGS.has(dest)).toBe(true);
    }
  });
  it('known aliases resolve to their canonical collection, not /collections/all', () => {
    expect(resolveCollectionRedirect('orthopedic-dog-beds')).toBe('/collections/dog-beds');
    expect(resolveCollectionRedirect('cat-trees-for-large-cats')).toBe('/collections/cat-trees-and-condos');
  });
});

describe('P0 SEO: canonical product namespace + legacy aliases', () => {
  const storefront = [
    'src/pages/GuidePage.tsx', 'src/pages/SeoCollection.tsx', 'src/components/seo/CategorySchema.tsx',
    'src/pages/BlogPost.tsx', 'src/pages/BestsellerDetail.tsx', 'src/components/products',
  ];
  function files(p: string): string[] {
    return statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => files(join(p, f))) : [p];
  }
  it('storefront code never builds /product/{slug} links', () => {
    for (const f of storefront.flatMap(files)) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/\/product\/\$\{/);
    }
  });
  it('BlogPost related products prefer slug over UUID', () => {
    expect(readFileSync('src/pages/BlogPost.tsx', 'utf8')).toContain('/products/${product.slug || product.id}');
  });
  it('normalizeProductLinks rewrites singular links', () => {
    expect(normalizeProductLinks('<a href="https://getpawsy.pet/product/x">')).toBe('<a href="/products/x">');
  });
  it('legacy aliases are noindex at runtime and pre-hydration', () => {
    expect(getRobotsDirective('/product/foo')).toBe('noindex');
    expect(getRobotsDirective('/bestseller/foo')).toBe('noindex');
    expect(getRobotsDirective('/collection/dogs')).toBe('noindex');
    expect(getRobotsDirective('/products/foo')).toBe('index');
    const shell = readFileSync('index.html', 'utf8');
    expect(shell).toContain("'/product','/bestseller','/collection'");
    expect(shell).toMatch(/replace\(\/\^\\\/product\\\/\/, '\/products\/'\)/);
  });
  it('the 404 page never self-canonicalizes', () => {
    const src = readFileSync('vite-plugin-prerender-products.ts', 'utf8');
    expect(src).not.toContain('href="${SITE}/404"');
  });
});

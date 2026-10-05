import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadSeoPolicy, findRedirectMapProblems } from '../../scripts/seo-indexability.mjs';
import { buildGuidePage, buildClusterNav, buildGuidesHubPage } from '../../vite-plugin-prerender-guides';
import { buildListingPage, productSeoTitle, clampMetaDescription } from '../../vite-plugin-prerender-products';
import { GUIDE_REDIRECTS } from '@/lib/guide-consolidation';
import { canonicalizeInternalHref, canonicalizeInternalLinks } from '@/lib/seo-internal-links';
import { SEO_CLUSTERS, CANONICAL_COLLECTION_META, COLLECTION_TRUST_LINE, clusterForGuide } from '@/lib/seo-clusters';
import { sanitizeGuideSeoTitle } from '@/lib/seo-title';
import { APPROVED_FREE_SHIPPING_LINE, APPROVED_RETURNS_LINE, scanForBannedTerms } from '@/config/merchant-policy';

const ROOT = join(__dirname, '..', '..');
const policy = loadSeoPolicy();
const SHELL = '<html><head><link rel="stylesheet" href="/assets/a.css"></head><body><div id="root"></div><script type="module" src="/assets/i.js"></script></body></html>';

function sitemapPaths(file: string, ns: string): Set<string> {
  const xml = readFileSync(join(ROOT, 'public', file), 'utf-8');
  return new Set([...xml.matchAll(/<loc>https:\/\/getpawsy\.pet\/([a-z-]+)\/([a-z0-9-]+)<\/loc>/g)].filter((m) => m[1] === ns).map((m) => m[2]));
}
const sitemapGuides = sitemapPaths('sitemap-guides.xml', 'guides');
const sitemapCollections = sitemapPaths('sitemap-collections.xml', 'collections');
const guideFiles = new Set(readdirSync(join(ROOT, 'public/data/guides')).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => f.slice(0, -5)));

describe('P1 guide consolidation', () => {
  it('redirect map has no chains, self-redirects or noindex targets', () => {
    expect(findRedirectMapProblems(GUIDE_REDIRECTS)).toEqual([]);
    for (const [from, to] of Object.entries(GUIDE_REDIRECTS)) {
      expect(from).not.toBe(to);
      expect(GUIDE_REDIRECTS[to], `${from} → ${to} chains`).toBeUndefined();
      expect(policy.noindexGuides.has(to), `${to} is noindex`).toBe(false);
    }
  });

  it('every P1 consolidation target is an advertised guide and no source is advertised', () => {
    for (const [from, to] of Object.entries(GUIDE_REDIRECTS)) {
      expect(sitemapGuides.has(from), `redirect source ${from} in sitemap`).toBe(false);
      if (guideFiles.has(to) || sitemapGuides.has(to)) expect(sitemapGuides.has(to), `target ${to} not advertised`).toBe(true);
    }
  });

  it('orphan guide files are either consolidated or advertised (sitemap ⇔ prerender parity)', () => {
    for (const slug of guideFiles) {
      if (slug in GUIDE_REDIRECTS || policy.noindexGuides.has(slug)) continue;
      expect(sitemapGuides.has(slug), `${slug} has a page but is not in the sitemap`).toBe(true);
    }
  });

  it('keeps the litter-box cluster pages from the approved linking work as canonical', () => {
    for (const s of ['automatic-litter-box-guide', 'how-to-train-cat-to-use-automatic-litter-box']) {
      expect(GUIDE_REDIRECTS[s]).toBeUndefined();
    }
  });
});

describe('P1 clusters: collection → pillar → supporting', () => {
  it('every cluster guide is canonical + advertised and belongs to one cluster', () => {
    const seen = new Set<string>();
    for (const c of SEO_CLUSTERS) {
      for (const s of [c.pillar, ...c.supporting]) {
        expect(sitemapGuides.has(s), `${c.key}: ${s} not advertised`).toBe(true);
        expect(GUIDE_REDIRECTS[s], `${s} is a redirect source`).toBeUndefined();
        expect(seen.has(s), `${s} in two clusters`).toBe(false);
        seen.add(s);
      }
      if (c.linkCollection !== false) expect(sitemapCollections.has(c.collection), `${c.collection}`).toBe(true);
      else expect(sitemapCollections.has(c.collection)).toBe(false);
    }
  });

  it('prerendered cluster nav links only advertised guides/collections', () => {
    const titles = new Map([...sitemapGuides].map((s) => [s, `T ${s}`]));
    const ctx = { knownGuides: sitemapGuides, allowedCollections: sitemapCollections, allowedProducts: new Set<string>() };
    const html = buildClusterNav('best-cat-trees-2026', titles, ctx);
    expect(html).toContain('href="/collections/cat-trees-and-condos"');
    expect(html).toContain('href="/guides/best-cat-trees-large-cats-2026"');
    expect(html).not.toContain('href="/guides/best-cat-trees-2026"');
    expect(buildClusterNav('cat-bed-guide', titles, ctx)).not.toContain('/collections/cat-beds');
    expect(clusterForGuide('not-a-cluster-guide')).toBeUndefined();
  });

  it('guide page breadcrumb uses /guides (matches schema), hub lists pillars first', () => {
    const page = buildGuidePage({ slug: 'best-cat-trees-2026', title: 'Best Cat Trees', excerpt: 'x', sections: [] } as never, SHELL, true);
    expect(page).toContain('<a href="/guides">Guides</a>');
    expect(page).not.toContain('/pet-care-guides');
    const hub = buildGuidesHubPage([{ slug: 'best-cat-trees-2026', title: 'Best Cat Trees', excerpt: '' } as never], SHELL);
    expect(hub).toContain('Start here');
    expect(hub).toContain('href="/collections/cat-trees-and-condos"');
  });
});

describe('P1 internal-link canonicalization', () => {
  const ctx = { knownGuides: sitemapGuides, allowedCollections: sitemapCollections, allowedProducts: new Set(['real-product']) };
  it('rewrites redirect sources, unlinks noindex/unknown/nested, keeps anchor text', () => {
    const [from, to] = Object.entries(GUIDE_REDIRECTS)[0];
    expect(canonicalizeInternalHref(`/guides/${from}`, ctx)).toBe(`/guides/${to}`);
    expect(canonicalizeInternalHref('/guides/does-not-exist-xyz', ctx)).toBeNull();
    expect(canonicalizeInternalHref('/guides/cluster/best-cat-water-fountain', ctx)).toBeNull();
    expect(canonicalizeInternalHref('/products/missing-product', ctx)).toBeNull();
    expect(canonicalizeInternalHref('https://example.com/a', ctx)).toBe('https://example.com/a');
    const out = canonicalizeInternalLinks('<a href="/guides/does-not-exist-xyz">Read this</a>', ctx);
    expect(out).toContain('Read this');
    expect(out).not.toContain('href="/guides/does-not-exist-xyz"');
  });

  it('storefront components link no redirect-source or unadvertised guides', () => {
    const files = [
      'src/components/authority/CollectionClusterIntro.tsx', 'src/components/guides/LitterBoxClusterLinks.tsx',
      'src/components/home/HomepageGuideLinks.tsx', 'src/components/layout/Footer.tsx',
      'src/components/seo/BlogCategoryLinks.tsx', 'src/components/seo/CatTreesHubContent.tsx',
      'src/components/seo/DogBedsHubContent.tsx', 'src/pages/IndoorCatCareResource.tsx',
      'src/pages/collections/OrthopedicDogBeds.tsx', 'src/pages/landing/SelfCleaningLitterBoxLanding.tsx',
    ];
    for (const f of files) {
      const src = readFileSync(join(ROOT, f), 'utf-8');
      for (const m of src.matchAll(/['"`]\/guides\/([a-z0-9-]+)['"`]/g)) {
        expect(GUIDE_REDIRECTS[m[1]], `${f} → redirect source ${m[1]}`).toBeUndefined();
        expect(sitemapGuides.has(m[1]), `${f} → unadvertised ${m[1]}`).toBe(true);
      }
    }
  });
});

describe('P1 metadata + schema', () => {
  it('collection meta: bounded length, approved trust line, no unverified claims', () => {
    expect(COLLECTION_TRUST_LINE).toBe(`${APPROVED_FREE_SHIPPING_LINE}, ${APPROVED_RETURNS_LINE}.`);
    for (const [slug, m] of Object.entries(CANONICAL_COLLECTION_META)) {
      expect(m.title.length, slug).toBeLessThanOrEqual(60);
      expect(m.description.length, slug).toBeLessThanOrEqual(160);
      expect(`${m.title} ${m.description}`).not.toMatch(/\d+\+ (premium )?products|premium|built to last|best|#1|tested|guarantee/i);
      expect(scanForBannedTerms(m.description)).toEqual([]);
    }
  });

  it('guide SEO titles drop unsupported testing/ranking/authority claims and stay ≤ 65', () => {
    const cases = [
      'Best Cat Toys (2026) – Tested Picks Cats Actually Use',
      'Are Automatic Cat Feeders Safe? – Vet-Backed Safety Guide (2026)',
      'Best Dog Carriers for Travel (2026) – Airline-Approved & Crash-Tested',
      'Best Litter Boxes for Multi-Cat Homes (2026) – Compared & Ranked | Free US Shipping',
      'How to Stop Dog Pulling on Leash – 5 Proven Methods | GetPawsy',
      'Best Wooden Cat Trees — Complete Guide for Pet Parents (2026)',
      'Front-Clip vs Back-Clip Harness – Expert Comparison | GetPawsy',
    ];
    for (const c of cases) {
      const t = sanitizeGuideSeoTitle(c);
      expect(t.length, t).toBeLessThanOrEqual(65);
      expect(t).not.toMatch(/tested|ranked|vet-backed|proven|expert|airline-approved|complete guide for pet parents|free (us )?shipping/i);
      expect((t.match(/GetPawsy/g) || []).length).toBeLessThanOrEqual(1);
    }
    expect(sanitizeGuideSeoTitle('Best Wooden Cat Trees — Complete Guide for Pet Parents (2026)')).toBe('Best Wooden Cat Trees (2026) | GetPawsy');
  });

  it('product titles/descriptions are bounded without mid-word cuts', () => {
    const long = 'Large Multi Level Cat Tree Tower With Sisal Scratching Posts Hammock And Condo For Indoor Cats';
    const t = productSeoTitle(long);
    expect(t.length).toBeLessThanOrEqual(65);
    expect(t.endsWith('… | GetPawsy')).toBe(true);
    expect(productSeoTitle('Cat Bed')).toBe('Cat Bed | GetPawsy');
    const d = clampMetaDescription('word '.repeat(60));
    expect(d.length).toBeLessThanOrEqual(160);
  });

  it('collection listing emits ItemList of canonical /products/ URLs and a guides section', () => {
    const html = buildListingPage({
      spaHtml: SHELL, path: '/collections/cat-toys', title: 'Cat Toys | GetPawsy', h1: 'Cat Toys', description: 'd', intro: 'i',
      crumbs: [{ name: 'Home', path: '/' }, { name: 'Products', path: '/products' }, { name: 'Cat Toys', path: '/collections/cat-toys' }],
      items: [{ href: '/products/a-toy', label: 'A toy' }], itemList: true,
      guides: [{ href: '/guides/cat-toy-buying-guide', label: 'Cat toy buying guide' }],
    });
    const lists = [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const itemList = lists.find((l) => l['@type'] === 'ItemList');
    expect(itemList.itemListElement[0].url).toBe('https://getpawsy.pet/products/a-toy');
    expect(html).toContain('href="/guides/cat-toy-buying-guide"');
    expect(html).not.toContain('/collections/all');
  });
});

describe('P1 build output (when dist exists)', () => {
  const dist = join(ROOT, 'dist');
  it.skipIf(!existsSync(join(dist, 'sitemap-guides.xml')))('indexable pages link and reference only advertised URLs', () => {
    const loc = new Set<string>();
    for (const f of readdirSync(dist).filter((f) => /^sitemap-.*\.xml$/.test(f))) {
      for (const m of readFileSync(join(dist, f), 'utf-8').matchAll(/<loc>https:\/\/getpawsy\.pet([^<]*)<\/loc>/g)) loc.add(m[1] || '/');
    }
    const hubs = new Set(['/', '/guides', '/blog', '/products']);
    const bad: string[] = [];
    for (const ns of ['guides', 'blog', 'collections']) {
      for (const slug of readdirSync(join(dist, ns))) {
        const f = join(dist, ns, slug, 'index.html');
        if (!existsSync(f)) continue;
        const h = readFileSync(f, 'utf-8');
        if (!/name="robots" content="index/.test(h)) continue;
        for (const m of h.matchAll(/href="(\/(?:guides|blog|collections|products|product)\/[^"#?]*)"/g)) {
          if (!loc.has(m[1]) && !hubs.has(m[1])) bad.push(`${ns}/${slug} → ${m[1]}`);
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
});

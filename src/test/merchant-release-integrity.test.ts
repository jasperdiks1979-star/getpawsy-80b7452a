/**
 * PHASE 10B — deterministic merchant artifact tests.
 *
 * Pure: no network, no build, no writes outside a temp dir.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, existsSync, unlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  SANDBOX_FIXTURE_PATTERNS,
  isSandboxFixture,
  excludeSandboxFixtures,
  containsSandboxFixture,
  assertNoSandboxFixtures,
  STALE_ARTIFACT_FILES,
  rejectStaleArtifact,
  validateFeedItem,
  partitionFeedItems,
  dedupeCanonicalUrls,
  assertNoDuplicateLocs,
  assertReleasableCatalog,
  ZERO_CATALOG_DIAGNOSTIC,
} from '@/lib/merchant/releaseIntegrity';

const BASE = 'https://getpawsy.pet';

function feedItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    title: 'Large Cat Tree',
    description: 'A sturdy cat tree.',
    link: `${BASE}/products/large-cat-tree`,
    image_link: 'https://cdn.example.com/cat-tree.jpg',
    price: '129.00 USD',
    availability: 'in_stock',
    brand: 'GetPawsy',
    condition: 'new',
    ...overrides,
  };
}

function renderUrlset(locs: string[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    locs.map((l) => `  <url><loc>${l}</loc></url>`).join('\n') +
    `\n</urlset>\n`
  );
}

describe('sandbox fixture exclusion', () => {
  it('detects fixtures by id, slug, name or url', () => {
    expect(isSandboxFixture({ slug: 'sandbox-catalog-placeholder' })).toBe(true);
    expect(isSandboxFixture({ id: 'SANDBOX_FIXTURE-1' })).toBe(true);
    expect(isSandboxFixture({ name: 'Test only cat bed' })).toBe(true);
    expect(isSandboxFixture({ loc: `${BASE}/products/sandbox-fixture-cat-tree` })).toBe(true);
    expect(isSandboxFixture({ slug: 'large-cat-tree', name: 'Large Cat Tree' })).toBe(false);
  });

  it('removes fixtures without mutating input', () => {
    const items = [{ slug: 'real-bed' }, { slug: 'sandbox-fixture-bed' }];
    const kept = excludeSandboxFixtures(items);
    expect(kept).toEqual([{ slug: 'real-bed' }]);
    expect(items).toHaveLength(2);
  });

  it('fails closed when rendered XML still contains a fixture URL', () => {
    const xml = renderUrlset([`${BASE}/products/sandbox-fixture-cat-tree`]);
    expect(containsSandboxFixture(xml)).toBe(true);
    expect(() => assertNoSandboxFixtures(xml, 'public/sitemap-products-1.xml')).toThrow(/SANDBOX fixture/);
  });

  it('passes a clean urlset', () => {
    const xml = renderUrlset([`${BASE}/products/large-cat-tree`]);
    expect(() => assertNoSandboxFixtures(xml, 'public/sitemap-products-1.xml')).not.toThrow();
  });

  it('never lets a fixture into the feed', () => {
    const { valid, rejected } = partitionFeedItems([
      feedItem(),
      feedItem({ id: 'sandbox-1', link: `${BASE}/products/sandbox-fixture-bed` }),
    ]);
    expect(valid).toHaveLength(1);
    expect(rejected[0].issues).toContain('sandbox_fixture');
  });

  it('keeps the Node mirror pattern list identical to the TypeScript source', async () => {
    const mirror = await import('../../scripts/merchant-integrity.mjs');
    expect(mirror.SANDBOX_FIXTURE_PATTERNS.map((r: RegExp) => r.source)).toEqual(
      SANDBOX_FIXTURE_PATTERNS.map((r) => r.source)
    );
    expect(mirror.STALE_ARTIFACT_FILES).toEqual([...STALE_ARTIFACT_FILES]);
  });
});

describe('stale artifacts', () => {
  it('lists every generated output that must be regenerated', () => {
    for (const f of ['google-feed.xml', 'merchant-feed.xml', 'sitemap.xml', 'sitemap-products-1.xml']) {
      expect(STALE_ARTIFACT_FILES).toContain(f);
    }
  });

  it('always refuses to reuse a previous artifact', () => {
    expect(() => rejectStaleArtifact('dist/google-feed.xml')).toThrow(/refusing to reuse/);
  });

  it('a source-controlled feed left on disk cannot prove current generation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'merchant-'));
    try {
      const stale = join(dir, 'google-feed.xml');
      writeFileSync(stale, '<?xml version="1.0" encoding="UTF-8"?><rss><channel><item/></channel></rss>');
      // Contract: outputs are deleted before generation.
      for (const f of STALE_ARTIFACT_FILES) {
        const p = join(dir, f);
        if (existsSync(p)) unlinkSync(p);
      }
      expect(existsSync(stale)).toBe(false);
      // And with zero eligible products the release still fails.
      expect(() => assertReleasableCatalog(0, 'merchant google feed')).toThrow(/0 eligible real products/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('feed item validation', () => {
  it('accepts a well formed item', () => {
    expect(validateFeedItem(feedItem())).toEqual([]);
  });

  it('rejects missing required fields', () => {
    expect(validateFeedItem(feedItem({ title: '' }))).toContain('missing_title');
    expect(validateFeedItem(feedItem({ image_link: null }))).toContain('missing_image_link');
    expect(validateFeedItem(feedItem({ brand: '' }))).toContain('missing_brand');
  });

  it('rejects malformed price, link and availability', () => {
    expect(validateFeedItem(feedItem({ price: '129 USD' }))).toContain('invalid_price');
    expect(validateFeedItem(feedItem({ price: '0.00 USD' }))).toContain('non_positive_price');
    expect(validateFeedItem(feedItem({ link: '/products/x' }))).toContain('invalid_link');
    expect(validateFeedItem(feedItem({ image_link: '/placeholder.svg' }))).toContain('invalid_image_link');
    expect(validateFeedItem(feedItem({ availability: 'maybe' }))).toContain('invalid_availability');
  });

  it('partitions duplicates-free valid items and reports issues', () => {
    const { valid, rejected } = partitionFeedItems([
      feedItem(),
      feedItem({ id: 'prod-2', price: 'free' }),
      feedItem({ id: 'prod-3', availability: 'out_of_stock' }),
    ]);
    expect(valid.map((v) => v.id)).toEqual(['prod-1', 'prod-3']);
    expect(rejected).toHaveLength(1);
  });

  it('agrees with structured data on id, link, price and availability', () => {
    const item = feedItem();
    const structuredData = {
      '@type': 'Product',
      productID: item.id,
      url: item.link,
      offers: {
        '@type': 'Offer',
        price: '129.00',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
      },
    };
    expect(structuredData.productID).toBe(item.id);
    expect(structuredData.url).toBe(item.link);
    expect(`${structuredData.offers.price} ${structuredData.offers.priceCurrency}`).toBe(item.price);
    expect(structuredData.offers.availability).toBe('https://schema.org/InStock');
    expect(item.availability).toBe('in_stock');
  });
});

describe('duplicate canonical URLs', () => {
  it('dedupes stably, first occurrence wins', () => {
    const { unique, duplicates } = dedupeCanonicalUrls([
      `${BASE}/collections/dog-beds`,
      `${BASE}/collections/dog-beds`,
      `${BASE}/collections/cats`,
    ]);
    expect(unique).toEqual([`${BASE}/collections/dog-beds`, `${BASE}/collections/cats`]);
    expect(duplicates).toHaveLength(1);
  });

  it('fails closed on a urlset containing repeated locs', () => {
    const xml = renderUrlset([`${BASE}/collections/dogs`, `${BASE}/collections/dogs`]);
    expect(() => assertNoDuplicateLocs(xml, 'public/sitemap-collections.xml')).toThrow(/duplicate canonical URL/);
  });

  it('passes a deduped urlset', () => {
    const { unique } = dedupeCanonicalUrls([`${BASE}/collections/dogs`, `${BASE}/collections/dogs`]);
    expect(() => assertNoDuplicateLocs(renderUrlset(unique), 'public/sitemap-collections.xml')).not.toThrow();
  });
});

describe('zero catalog release gate', () => {
  it('fails with the precise diagnostic', () => {
    expect(() => assertReleasableCatalog(0, 'merchant google feed')).toThrow(ZERO_CATALOG_DIAGNOSTIC.slice(0, 60));
  });

  it('passes with at least one eligible real product', () => {
    expect(() => assertReleasableCatalog(1, 'merchant google feed')).not.toThrow();
  });
});

describe('source-controlled public artifacts', () => {
  it('contains no sandbox fixture URLs', () => {
    for (const f of ['sitemap.xml', 'sitemap-products-1.xml', 'sitemap-collections.xml']) {
      const p = join(process.cwd(), 'public', f);
      if (!existsSync(p)) continue;
      const xml = readFileSync(p, 'utf8');
      expect(containsSandboxFixture(xml)).toBe(false);
      expect(() => assertNoDuplicateLocs(xml, `public/${f}`)).not.toThrow();
    }
  });
});

describe('test-only generator with injected labelled fixtures', () => {
  it('produces valid escaped XML from an injected catalog and never emits the fixture', async () => {
    const { renderUrlset } = await import('../../scripts/sitemap-utils.mjs');
    const injected = [
      { slug: 'cat-tree-deluxe', name: 'Cat Tree & Condo "Deluxe"' },
      { slug: 'cat-tree-deluxe', name: 'Duplicate row' },
      { slug: 'SANDBOX_FIXTURE-cat-tree', name: 'SANDBOX_FIXTURE cat tree' },
    ];
    const entries = excludeSandboxFixtures(injected).map((p) => ({
      loc: `${BASE}/products/${p.slug}`,
      lastmod: '2026-01-02',
    }));
    const { unique } = dedupeCanonicalUrls(entries.map((e) => e.loc));
    const xml = renderUrlset(unique.map((loc) => ({ loc, lastmod: '2026-01-02' })));

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset');
    expect((xml.match(/<url>/g) || []).length).toBe(1);
    expect(() => assertNoSandboxFixtures(xml, 'test/urlset')).not.toThrow();
    expect(() => assertNoDuplicateLocs(xml, 'test/urlset')).not.toThrow();
  });

  it('escapes XML-hostile characters in loc values', async () => {
    const { renderUrlset, escapeXml } = await import('../../scripts/sitemap-utils.mjs');
    const xml = renderUrlset([{ loc: `${BASE}/products/a&b<c>` }]);
    expect(xml).toContain('&amp;');
    expect(xml).not.toContain('<c>');
    expect(escapeXml('"x"')).toBe('&quot;x&quot;');
  });
});

describe('fixture scanning is scoped to identifying fields', () => {
  const realItem = `<item>
      <g:id>p-123</g:id>
      <title>Wooden Dog House</title>
      <link>https://getpawsy.com/products/dog-house-no-shipments-on-weekends</link>
      <description>Please note: We do not ship on weekends. Order today.</description>
    </item>`;

  it('does not flag real prose in a description as a sandbox fixture', () => {
    expect(containsSandboxFixture(realItem)).toBe(false);
    expect(() => assertNoSandboxFixtures(realItem, 'public/google-feed.xml')).not.toThrow();
  });

  it('still flags a fixture marker in an identifying field', () => {
    const bad = realItem.replace('<g:id>p-123</g:id>', '<g:id>SANDBOX_FIXTURE-1</g:id>');
    expect(containsSandboxFixture(bad)).toBe(true);
    expect(() => assertNoSandboxFixtures(bad, 'public/google-feed.xml')).toThrow(/SANDBOX fixture/);
  });

  it('node mirror agrees with the TypeScript module', async () => {
    const mirror = await import('../../scripts/merchant-integrity.mjs');
    expect(mirror.containsSandboxFixture(realItem)).toBe(false);
    expect(
      mirror.containsSandboxFixture(realItem.replace('<title>Wooden Dog House</title>', '<title>SANDBOX fixture</title>'))
    ).toBe(true);
  });
});

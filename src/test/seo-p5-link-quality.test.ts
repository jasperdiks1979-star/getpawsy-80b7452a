import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { canonicalizeInternalLinks, canonicalizeInternalHref, CONTENT_PATH_REWRITES } from '@/lib/seo-internal-links';
import { ROOT_GUIDE_CONSOLIDATION } from '@/lib/seo-root-consolidation';
import { stripUnsupportedTitleClaims, sanitizeGuideSeoTitle } from '@/lib/seo-title';

const sitemap = new Set(
  ['guides', 'blog', 'products-1'].flatMap((f) =>
    [...readFileSync(`public/sitemap-${f}.xml`, 'utf8').matchAll(/<loc>https:\/\/getpawsy\.pet([^<]+)<\/loc>/g)].map((m) => m[1]),
  ),
);

describe('content path rewrites', () => {
  it('every rewrite target is a sitemap page', () => {
    for (const to of Object.values(CONTENT_PATH_REWRITES)) expect(sitemap.has(to), to).toBe(true);
  });
  it('includes every root consolidation source', () => {
    for (const [src, to] of Object.entries(ROOT_GUIDE_CONSOLIDATION)) expect(CONTENT_PATH_REWRITES[src]).toBe(to);
  });
  it('rewrites stale content links (markdown and html, with fragment)', () => {
    expect(canonicalizeInternalHref('/how-to-stop-dog-anxiety-in-car')).toBe('/blog/how-to-stop-dog-anxiety-in-car');
    expect(canonicalizeInternalHref('https://getpawsy.pet/best-cat-litter-box-2026#top')).toBe('/guides/best-cat-litter-box-2026#top');
    expect(canonicalizeInternalLinks('[x](/cat/cat-trees-for-large-cats)')).toBe('[x](/guides/best-cat-trees-large-cats-2026)');
    expect(canonicalizeInternalLinks('<a href="/lp/self-cleaning-litter-box">y</a>')).toBe('<a href="/products/automatic-cat-litter-box-self-cleaning-app-control">y</a>');
    expect(canonicalizeInternalHref('/about')).toBe('/about');
  });
});

describe('guide content has no claim-laden anchors or stale paths', () => {
  const dir = 'public/data/guides';
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  it('no "crash-tested" link text', () => {
    for (const f of files) expect(readFileSync(`${dir}/${f}`, 'utf8'), f).not.toMatch(/\[crash-tested[^\]]*\]\(/i);
  });
  it('no unsupported dual-sensor claims for the automatic litter box', () => {
    for (const f of ['how-does-self-cleaning-litter-box-work.json', 'is-self-cleaning-litter-box-safe.json'])
      expect(readFileSync(`${dir}/${f}`, 'utf8')).not.toMatch(/dual infrared|triple-safety/i);
  });
});

describe('link-label claim hygiene', () => {
  it('strips testing claims without brand suffix or clamp', () => {
    const t = stripUnsupportedTitleClaims('Best Cat Toys (2026) – Interactive & Solo Play Picks Tested');
    expect(t).not.toMatch(/tested/i);
    expect(t).not.toContain('GetPawsy');
    expect(sanitizeGuideSeoTitle('Best Cat Toys (2026)')).toContain('| GetPawsy');
  });
  it('prerenderers label guide links through the hygiene helper', () => {
    expect(readFileSync('vite-plugin-prerender-guides.ts', 'utf8').match(/stripUnsupportedTitleClaims\(/g)!.length).toBeGreaterThanOrEqual(3);
    expect(readFileSync('vite-plugin-prerender-products.ts', 'utf8')).toContain('stripUnsupportedTitleClaims(g.title)');
  });
});

describe('hydrated related-guide cards', () => {
  it('GuidePage maps retired slugs to canonical guides and strips claim labels', () => {
    const src = readFileSync('src/pages/GuidePage.tsx', 'utf8');
    expect(src).toMatch(/getGuideRedirectTarget\(rg\.slug\)/);
    expect(src).toMatch(/stripUnsupportedTitleClaims\(base\.title\)/);
  });
});

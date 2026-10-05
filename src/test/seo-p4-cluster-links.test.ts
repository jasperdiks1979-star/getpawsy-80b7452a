import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { GUIDE_REDIRECTS } from '@/lib/guide-consolidation';
import { ROOT_GUIDE_CONSOLIDATION } from '@/lib/seo-root-consolidation';

const files = [
  ...readdirSync('public/data/guides').filter((f) => f.endsWith('.json') && /cat|litter|scratch/.test(f) && !/dog/.test(f)).map((f) => `public/data/guides/${f}`),
  'src/components/guides/LitterBoxClusterLinks.tsx',
  'src/components/home/BestBuyingGuides2026.tsx',
  'src/components/home/FeaturedCollectionsGuides.tsx',
  'src/pages/guides/IndoorCatFurnitureGuide.tsx',
];

describe('cat cluster links point at canonical pillars, never consolidated sources', () => {
  for (const f of files) {
    it(f, () => {
      const t = readFileSync(f, 'utf8');
      const guideLinks = [...t.matchAll(/(?<![a-z0-9.-])\/guides\/([a-z0-9-]+)(?![a-z0-9-])/g)].map((m) => m[1]);
      const own = f.match(/guides\/([a-z0-9-]+)\.json$/)?.[1];
      expect(guideLinks.filter((s) => s !== own && GUIDE_REDIRECTS[s])).toEqual([]);
      for (const root of Object.keys(ROOT_GUIDE_CONSOLIDATION)) expect(t).not.toMatch(new RegExp(`["'\`(]${root}["'\`)]`));
    });
  }
  it('homepage cluster list has no duplicate destinations', () => {
    const t = readFileSync('src/components/home/BestBuyingGuides2026.tsx', 'utf8');
    const block = t.slice(t.indexOf('CLUSTER_PAGES'));
    const paths = [...block.matchAll(/path: '([^']+)'/g)].map((m) => m[1]);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

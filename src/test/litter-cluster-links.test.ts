import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LITTER_CLUSTER_CONFIG } from '@/components/guides/LitterBoxClusterLinks';

const read = (p: string) => readFileSync(resolve(p), 'utf8');
const src = read('src/components/guides/LitterBoxClusterLinks.tsx');

describe('litter-box cluster links', () => {
  it('never links a page to itself', () => {
    const self: Record<string, string> = {
      collection: '/collections/cat-litter-boxes',
      'automatic-guide': '/guides/automatic-litter-box-guide',
      'training-guide': '/guides/how-to-train-cat-to-use-automatic-litter-box',
      'best-2026': '/best-cat-litter-box-2026',
      reddit: '/best-cat-litter-box-reddit',
    };
    for (const [k, c] of Object.entries(LITTER_CLUSTER_CONFIG)) {
      expect(c.links.map(l => l.href)).not.toContain(self[k]);
      expect(c.links.length).toBeLessThanOrEqual(4);
    }
  });
  it('automatic guides get no product stand-ins', () => {
    expect(LITTER_CLUSTER_CONFIG['automatic-guide'].products).toBe(0);
    expect(LITTER_CLUSTER_CONFIG['training-guide'].products).toBe(0);
  });
  it('products pass all storefront gates', () => {
    for (const g of [".eq('is_active', true)", ".gt('stock', 0)", ".eq('merch_hidden', false)", ".neq('merch_role', 'blocked')", ".eq('is_duplicate', false)"]) {
      expect(src).toContain(g);
    }
  });
  it('reuses guide_product_click only', () => {
    expect(src).toContain("trackEvent('guide_product_click'");
    expect(src.match(/trackEvent\(/g)).toHaveLength(1);
  });
  it('is wired into exactly the five pages', () => {
    expect(read('src/pages/GuidePage.tsx')).toContain('page="automatic-guide"');
    expect(read('src/pages/GuidePage.tsx')).toContain('page="training-guide"');
    expect(read('src/pages/SeoCollection.tsx')).toContain("collection.slug === 'cat-litter-boxes' && <LitterBoxClusterLinks");
    expect(read('src/pages/seo/SeoTrafficPage.tsx')).toContain("props.slug === 'best-cat-litter-box-2026'");
    expect(read('src/pages/seo/SeoClusterPage.tsx')).toContain("props.slug === 'best-cat-litter-box-reddit'");
  });
});

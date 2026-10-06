import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CANONICAL_COLLECTION_META } from '@/lib/seo-clusters';

describe('cat litter box collection copy', () => {
  const m = CANONICAL_COLLECTION_META['cat-litter-boxes'];
  it('carries only truthful, consistent copy', () => {
    for (const t of [m.title, m.description, m.h1 ?? '', m.intro ?? '']) {
      expect(t).not.toMatch(/odor-free|perfect for|automatic|self-cleaning|tested|best/i);
    }
    expect(m.intro).toContain('$35+');
  });
  it('hydrated page and prerender use the same h1 and intro', () => {
    expect(readFileSync('src/pages/SeoCollection.tsx', 'utf8')).toContain('CANONICAL_COLLECTION_META[collection.slug]?.h1');
    const pre = readFileSync('vite-plugin-prerender-products.ts', 'utf8');
    expect(pre).toContain('CANONICAL_COLLECTION_META[slug]?.h1');
    expect(pre).toContain('CANONICAL_COLLECTION_META[slug]?.intro');
  });
});

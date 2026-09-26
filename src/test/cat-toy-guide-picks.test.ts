import { describe, expect, it } from 'vitest';
import catToys from '../../public/data/guides/best-cat-toys.json';
import interactive from '../../public/data/guides/best-interactive-cat-toys-that-work.json';

describe('cat-toy guide picks', () => {
  it.each([catToys, interactive])('links three pictured picks to canonical product pages', guide => {
    const picks = Object.values(guide.quickRecommendation);
    expect(picks).toHaveLength(3);
    for (const pick of picks) {
      expect(pick.link).toMatch(/^\/products\/[a-z0-9-]+$/);
      expect(pick.image).toMatch(/^https:\/\//);
    }
  });

  it('has no retired product link in the interactive guide', () => {
    expect(JSON.stringify(interactive)).not.toContain('compass-cat-scratching-post');
    expect(JSON.stringify(interactive)).not.toContain('4-6-in-dark-gray-cat-tree');
  });
});
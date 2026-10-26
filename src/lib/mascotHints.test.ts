import { describe, it, expect } from 'vitest';
import { mascotHint } from './mascotHints';
describe('mascotHint', () => {
  it('litter box context links to litter collection', () => {
    expect(mascotHint({ slug: 'cat-litter-boxes' }).links[0].to).toBe('/collections/cat-litter-boxes');
  });
  it('dog bed product links to dog beds', () => {
    expect(mascotHint({ name: 'Soft Dog Bed', species: 'both' }).links[0].to).toBe('/collections/dog-beds');
  });
  it('unknown context offers cats and dogs', () => {
    expect(mascotHint({}).links.map((l) => l.to)).toEqual(['/collections/cats', '/collections/dogs', '/']);
  });
});

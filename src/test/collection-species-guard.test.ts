import { describe, it, expect } from 'vitest';
import { applySpeciesGuard, collectionSpeciesTarget } from '@/lib/collection-species-guard';

const cat = { name: 'Cat Tunnel', primary_species: 'cat' };
const both = { name: '3-in-1 Slow Feeder Bowl for Cats and Small Dogs', primary_species: 'both' };
const dog = { name: 'Dog Leash', primary_species: 'dog' };

describe('collection species guard', () => {
  it('treats /collections/cats and /collections/dogs as species pages', () => {
    expect(collectionSpeciesTarget('cats')).toBe('cat');
    expect(collectionSpeciesTarget('dogs')).toBe('dog');
    expect(collectionSpeciesTarget('all')).toBeNull();
  });
  it('hides multi-pet items on cat pages unless opted in', () => {
    expect(applySpeciesGuard([cat, both, dog], 'cat', false)).toEqual([cat]);
    expect(applySpeciesGuard([cat, both, dog], 'cat', true)).toEqual([cat, both]);
  });
  it('never shows dog-only items on cat pages', () => {
    expect(applySpeciesGuard([dog], 'cat', true)).toEqual([]);
  });
  it('keeps the general catalog unfiltered', () => {
    expect(applySpeciesGuard([cat, both, dog], null, false)).toHaveLength(3);
  });
});

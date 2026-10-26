import { describe, it, expect } from 'vitest';
import { guidePetContext, guideMascotLinks } from './GuideMascotCTA';

describe('guide mascot CTA context', () => {
  it('cat guide links to cat collection', () => {
    expect(guidePetContext('Best litter boxes for apartments')).toBe('cat');
    expect(guideMascotLinks('cat').shop.to).toBe('/collections/cats');
  });
  it('dog guide links to dog collection', () => {
    expect(guidePetContext('Choosing a raised dog bed')).toBe('dog');
    expect(guideMascotLinks('dog').shop.to).toBe('/collections/dogs');
  });
  it('mixed or unknown topic stays general', () => {
    expect(guidePetContext('Cats and dogs living together')).toBe('general');
    expect(guidePetContext('Pet travel tips')).toBe('general');
  });
});

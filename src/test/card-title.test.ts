import { describe, it, expect } from 'vitest';
import { cardTitle } from '@/lib/cardTitle';

describe('cardTitle', () => {
  it('fixes a dash glued to the next word', () => {
    expect(cardTitle('54 –Cat Tree Tower')).toBe('54 – Cat Tree Tower');
  });
  it('keeps short titles unchanged', () => {
    expect(cardTitle('Cat Scratcher')).toBe('Cat Scratcher');
  });
  it('shortens long titles at a separator without trailing punctuation', () => {
    const out = cardTitle('Extra Large Stainless Steel Litter Box, Enclosed Cat Litter Box with Scoop and Deodorizer Bag');
    expect(out).toBe('Extra Large Stainless Steel Litter Box, Enclosed Cat Litter Box');
    expect(out.length).toBeLessThanOrEqual(64);
  });
});

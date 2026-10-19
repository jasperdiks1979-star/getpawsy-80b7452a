import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const guides = [
  'best-cat-trees-for-indoor-cats',
  'best-cat-trees-2026',
  'cat-litter-box-guide',
];

describe('GetPawsy editorial guide evidence integrity', () => {
  for (const slug of guides) {
    it(`${slug} has valid JSON and does not promise unsupported first-hand studies`, () => {
      const text = readFileSync(`public/data/guides/${slug}.json`, 'utf8');
      const guide = JSON.parse(text);
      expect(guide.slug).toBe(slug);
      expect(text).not.toMatch(/(?:9|10|12) (?:cat trees|litter box types) tested (?:in real homes|across 6 months|for stability)/i);
      expect(text).not.toMatch(/referenced by 3 veterinary clinics|after testing (?:6 models|9 cat trees|dozens of litter boxes)|our own hands-on testing|our engagement testing/i);
    });
  }
});

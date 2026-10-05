import { describe, it, expect } from 'vitest';
import { sanitizeSeoDescription, sanitizeGuideSeoTitle } from '@/lib/seo-title';
import { firstParagraphText } from '../../vite-plugin-prerender-guides';

const CLAIMS = /\b(tested|ranked|vet[- ]backed|expert|crash[- ]tested|guaranteed|safest|odor[- ]free|escape[- ]proof|proven|science[- ]backed|honest review)\b/i;

describe('P2 crawler metadata claim hygiene', () => {
  it('descriptions lose unsupported claims but keep factual text', () => {
    const cases: Array<[string, string]> = [
      ['Expert tips to eliminate litter box odor.', 'Tips to eliminate litter box odor.'],
      ['Keep your dog feeling their best with our expert recommendations.', 'Keep your dog feeling their best with our recommendations.'],
      ['Stop leash pulling with 5 proven techniques.', 'Stop leash pulling with 5 techniques.'],
      ['Orthopedic, calming & elevated picks ranked by vets. Updated 2026.', 'Orthopedic, calming & elevated picks. Updated 2026.'],
      ['Tested kitten-safe cat trees with low platforms.', 'Kitten-safe cat trees with low platforms.'],
      ['Find the safest and most comfortable car seats for small dogs.', 'Find most comfortable car seats for small dogs.'],
      ['Learn 5 vet-backed solutions to reduce joint pain.', 'Learn 5 solutions to reduce joint pain.'],
    ];
    for (const [input, out] of cases) {
      expect(sanitizeSeoDescription(input)).toBe(out);
      expect(sanitizeSeoDescription(input)).not.toMatch(CLAIMS);
    }
  });

  it('blog/guide titles lose review/escape-proof/odor-free/science-backed claims', () => {
    for (const t of [
      'Best Cat Toys for Bored Indoor Cats 2026 | Top Picks & Reviews | GetPawsy',
      'Best Cat Harness (2026) – Escape-Proof Picks That Fit | GetPawsy',
      'Best Self-Cleaning Litter Box Under $300 (2026 Honest Review)',
      'Calming Beds for Anxiety: Do They Work? Science-Backed (2026)',
      'Best Litter Box Furniture for Apartments 2026 — Compact & Odor-Free',
    ]) {
      const s = sanitizeGuideSeoTitle(t);
      expect(s).not.toMatch(CLAIMS);
      expect(s.length).toBeLessThanOrEqual(65);
    }
  });

  it('fallback description uses stored guide text verbatim (no synthesis)', () => {
    const g = { slug: 's', title: 'T', content: '<p>Short.</p><h2>x</h2>', sections: [{ heading: 'H', content: '<p>Big beds use dense foam layers that keep larger dogs supported overnight.</p>' }] };
    expect(firstParagraphText(g as never)).toBe('Big beds use dense foam layers that keep larger dogs supported overnight.');
    expect(firstParagraphText({ slug: 's', title: 'T' } as never)).toBe('');
  });
});

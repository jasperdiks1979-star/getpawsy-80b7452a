/**
 * Phase 10: published guide pages must not carry fabricated star ratings,
 * popularity badges, or claims that GetPawsy tests products in-house.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { neutralBadge } from '@/pages/seo/SeoTrafficPage';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) && !/\.test\./.test(p) ? [p] : [];
  });
}

const sources = [...walk('src/pages'), ...walk('src/lib'), ...walk('src/data')];

describe('no in-house testing claims', () => {
  it('never says GetPawsy tested or measured products', () => {
    const offenders = sources.filter((p) =>
      /\b(we|our) (tested|testing methodology)\b|\bwe measured\b|sniff test/i.test(
        readFileSync(p, 'utf8').replace(/\/\/[^\n]*/g, ''),
      ),
    );
    expect(offenders).toEqual([]);
  });
});

describe('guide badges carry no popularity claim', () => {
  it('rewrites popularity and rank wording', () => {
    expect(neutralBadge('Most Popular')).toBe('Our pick');
    expect(neutralBadge('Best Seller')).toBe('Our pick');
    expect(neutralBadge('#1 Best Overall')).toBe('Best Overall');
    expect(neutralBadge('Best Budget')).toBe('Best Budget');
  });
});

describe('guide templates render no fabricated star ratings', () => {
  it('drops rating output from the roundup templates', () => {
    for (const f of ['src/pages/seo/SeoTrafficPage.tsx', 'src/pages/seo/SeoClusterPage.tsx']) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/\{p\.rating\}|\{pick\.rating\}/);
    }
  });
});

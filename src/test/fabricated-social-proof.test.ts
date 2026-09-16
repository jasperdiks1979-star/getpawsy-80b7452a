import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Phase 7 guard: GetPawsy has zero approved customer reviews.
 * No page may emit a store/product rating, a review count, an invented
 * testimonial, or a hands-on testing claim.
 */

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'test' || entry === '__tests__') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC);
const read = (f: string) => readFileSync(f, 'utf8');

describe('fabricated social proof', () => {
  it('emits no hardcoded aggregateRating in structured data', () => {
    const offenders = files.filter((f) => {
      const src = read(f);
      if (f.includes('/admin/')) return false;
      // a literal rating value next to aggregateRating means it is not computed
      return /aggregateRating[^}]{0,200}ratingValue:\s*['"][0-9]/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it('has no invented testimonials in the training landing data', () => {
    const src = read(join(SRC, 'data', 'training-landing-pages.ts'));
    expect(src).not.toMatch(/verified:\s*true/);
    expect(src).not.toMatch(/stars:\s*[0-9]/);
  });

  it('makes no hands-on / laboratory testing claims', () => {
    const offenders = files.filter((f) => {
      if (f.includes('HowWeTestProducts')) return false; // explicitly disclaims testing
      const src = read(f);
      return /hands-on testing|we conduct hands-on|lab-tested|laboratory testing with/i.test(src)
        && !/do\s+(<strong[^>]*>)?not(<\/strong>)?\s+perform/i.test(src);
    });
    expect(offenders).toEqual([]);
  });
});

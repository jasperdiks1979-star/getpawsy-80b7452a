/**
 * Trust-claim invariants.
 *
 * The storefront may only state things we can evidence. These tests fail the
 * build if invented social proof creeps back into shopper-facing code:
 * hardcoded testimonials, fabricated customer counts, or star ratings that are
 * not computed from real review rows.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Shopper-facing source. Admin tooling and tests are out of scope. */
const ROOTS = ['src/components', 'src/pages'];
const SKIP = /(\/admin\/|\/admin$|__tests__|\.test\.|\/test\/)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (SKIP.test(full)) continue;
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const FILES = ROOTS.flatMap((r) => walk(resolve(r))).map((f) => ({
  file: f.replace(`${process.cwd()}/`, ''),
  body: readFileSync(f, 'utf8'),
}));

/** Strip comments so an explanatory note about a removed claim isn't a hit. */
function code(body: string): string {
  return body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const BANNED: Array<{ label: string; re: RegExp }> = [
  {
    label: 'invented customer counts (e.g. "10,000+ pet parents", "thousands of dog owners")',
    re: /(?:\d[\d,]{2,}\s*\+?|thousands of|hundreds of)\s*(?:happy\s+)?(?:us\s+)?(?:pet parents|pet owners|dog owners|cat owners|customers|pet families)/i,
  },
  {
    label: 'hardcoded star rating',
    re: /(?:rating=\{\s*[45](?:\.\d)?\s*\}|[45]\.\d\s*★|★\s*[45]\.\d)/,
  },
  {
    label: 'claimed satisfaction percentage',
    re: /\b9[0-9](?:\.\d)?%\s*(?:of\s+)?(?:customers|owners|satisfaction|satisfied|would recommend)/i,
  },
];

describe('trust claims', () => {
  for (const { label, re } of BANNED) {
    it(`no shopper-facing file contains ${label}`, () => {
      const hits = FILES.filter(({ body }) => re.test(code(body))).map(({ file, body }) => {
        const m = code(body).match(re);
        return `${file}: ${m?.[0]}`;
      });
      expect(hits).toEqual([]);
    });
  }

  it('checkout shows policy facts, not testimonials', () => {
    const src = readFileSync(resolve('src/components/checkout/CheckoutSocialProof.tsx'), 'utf8');
    expect(code(src)).not.toMatch(/REVIEWS\s*=\s*\[/);
    expect(src).toContain('Stripe');
  });

  it('the hero trust strip carries no review snippets', () => {
    const src = readFileSync(resolve('src/components/home/HeroTrustStrip.tsx'), 'utf8');
    expect(code(src)).not.toMatch(/RECENT_REVIEWS/);
    expect(code(src)).not.toMatch(/StarRating/);
  });

  it('product badges make no sales-ranking claim', () => {
    const card = readFileSync(resolve('src/components/products/ProductCard.tsx'), 'utf8');
    const winners = readFileSync(resolve('src/config/top-winners.ts'), 'utf8');
    for (const src of [card, winners]) {
      expect(code(src)).not.toMatch(/'(?:Best Seller|Top Rated|Popular|Most Popular|Top Pick)'/i);
    }
  });

  it('primary cat collections only list merchandised products', () => {
    const src = readFileSync(resolve('src/lib/collection-matching-engine.ts'), 'utf8');
    expect(src).toContain('PRIMARY_MERCHANDISED_COLLECTIONS');
    expect(src).toContain("poolQuery.eq('merch_hidden', false)");
  });
});

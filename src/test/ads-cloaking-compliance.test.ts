/**
 * Google Ads "circumventing systems / cloaking" regression checks.
 * Static checks only: canonical host, crawler-neutral config, and
 * obsolete identity / shipping claims in public storefront artifacts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TRUST_LABELS } from '@/config/trust-blocks';
import {
  FREE_SHIPPING_THRESHOLD,
  DELIVERY_TIME_STANDARD,
  BUSINESS_LOCATION,
  BUSINESS_OPERATOR,
} from '@/lib/shipping-constants';

function walk(dir: string, exts: RegExp, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.test(name)) out.push(p);
  }
  return out;
}

const PUBLIC_CONTENT = [
  ...walk('public/data', /\.json$/),
  'public/robots.txt',
  'public/llms.txt',
  'public/.well-known/llms.txt',
  'index.html',
];

// Storefront code (admin pages, tests and diagnostics excluded).
const STOREFRONT_SRC = walk('src', /\.(ts|tsx)$/).filter(
  (f) =>
    !/src[\\/](test|pages[\\/]admin|components[\\/]admin|pages[\\/]diagnostics|integrations)[\\/]/.test(f) &&
    !/\.test\.tsx?$/.test(f),
);

const OBSOLETE_IDENTITY = [/GetPawsy\s+LLC/i, /New York,?\s*(NY|New York)\b/i, /headquartered in New York/i];
const OBSOLETE_SHIPPING = [/3\s*[-–—]\s*7 business days/i, /ships in 3\s*[-–—]\s*7 days/i, /arrives? in 3\s*[-–—]\s*7/i];

describe('authoritative policy values', () => {
  it('identity is Skidzo / Apeldoorn, Netherlands', () => {
    expect(BUSINESS_OPERATOR).toBe('Skidzo');
    expect(BUSINESS_LOCATION).toBe('Apeldoorn, Netherlands');
  });
  it('trust strip free-shipping label matches the configured threshold', () => {
    expect(TRUST_LABELS.free_shipping).toBe(`Free shipping over $${FREE_SHIPPING_THRESHOLD}`);
  });
});

describe('no obsolete identity or shipping claims', () => {
  for (const f of [...PUBLIC_CONTENT, ...STOREFRONT_SRC]) {
    it(f, () => {
      const s = readFileSync(f, 'utf8');
      for (const re of [...OBSOLETE_IDENTITY, ...OBSOLETE_SHIPPING]) expect(s, `${re} in ${f}`).not.toMatch(re);
    });
  }
  it('corrected cat-tree guide uses the standard delivery window and threshold', () => {
    const s = readFileSync('public/data/guides/best-cat-trees-large-cats-2026.json', 'utf8');
    expect(s).toContain(DELIVERY_TIME_STANDARD);
    expect(s).not.toMatch(/over \$49/);
  });
});

describe('canonical host is https://getpawsy.pet (no www, no http)', () => {
  const files = ['index.html', 'public/robots.txt', ...walk('public', /^sitemap.*\.xml$/)];
  for (const f of files) {
    it(f, () => {
      const s = readFileSync(f, 'utf8');
      expect(s).not.toMatch(/https?:\/\/www\.getpawsy\.pet/);
      expect(s).not.toMatch(/http:\/\/getpawsy\.pet/);
    });
  }
  it('robots.txt declares the apex https sitemap and does not block AdsBot', () => {
    const s = readFileSync('public/robots.txt', 'utf8');
    expect(s).toContain('Sitemap: https://getpawsy.pet/sitemap.xml');
    expect(s).not.toMatch(/User-agent:\s*AdsBot/i);
    expect(s).not.toMatch(/^Disallow:\s*\/\s*$/m);
  });
  it('index.html does not advertise the non-existent /feed.xml', () => {
    expect(readFileSync('index.html', 'utf8')).not.toContain('getpawsy.pet/feed.xml');
  });
});

describe('no crawler-conditional destination or content', () => {
  it('index.html never branches on crawler user agents', () => {
    const s = readFileSync('index.html', 'utf8');
    expect(s).not.toMatch(/navigator\.userAgent[^;\n]*(bot|google|adsbot)/i);
  });
  it('_redirects has no user-agent or crawler-conditional rules', () => {
    const s = readFileSync('public/_redirects', 'utf8');
    expect(s).not.toMatch(/user-?agent|googlebot|adsbot/i);
  });
});

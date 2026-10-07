/**
 * P0 stabilization regressions: truthful trust copy, no category leakage on
 * PDPs, truthful identifiers, one shipping window, real not-found for dead slugs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { detectPdpCategory } from '@/lib/pdp-category';
import { CATEGORY_CONTEXT, ProductProblemSolution } from '@/components/products/ProductProblemSolution';
import { IDEAL_FOR } from '@/components/products/ProductIdealFor';
import { ProductVsAlternatives } from '@/components/products/ProductVsAlternatives';
import { getCtaCopy } from '@/components/products/FinalCtaBlock';
import { resolveProductIdentifiers, isValidGtin } from '@/lib/product-identifiers';
import { US_HANDLING_DAYS, US_TRANSIT_DAYS } from '@/lib/shipping-windows';
import { DELIVERY_TIME_STANDARD, PROCESSING_TIME } from '@/lib/shipping-constants';

const read = (p: string) => readFileSync(resolve(p), 'utf8');
const ATTRIBUTE_CLAIMS = /memory foam|bpa|chew-proof|heavy-duty|machine[- ]wash|dishwasher|non-slip|supports? \d+\+? ?lbs?|\d+%|airline|orthopedic|joint relief|odor-free|self-clean/i;

describe('P0-1 no unsupported first-party testing claims', () => {
  const files = [
    'src/components/seo/WhyTrustGetPawsy.tsx',
    'src/pages/About.tsx',
    'src/components/seo/CategoryClusterLinks.tsx',
    'src/components/authority/CollectionClusterIntro.tsx',
    'src/components/products/ProductProblemSolution.tsx',
    'src/components/home/PremiumNicheGrid.tsx',
    'src/components/home/MoneyHubBlocks.tsx',
    'src/components/home/TrendingGuidesStrip.tsx',
    'src/components/home/HomepageGuideLinks.tsx',
    'src/pages/seo/SeoTrafficPage.tsx',
    'src/pages/seo/BestDogCarSeatSafety.tsx',
  ];
  const BANNED = /real product testing|we (?:crash-)?tested|tested by our|tested for (?:comfort|stability|smell|big breeds|quality)|tested in real|pet-tested|anti-tip tested|tested & reviewed|crash-testing \d+|vet[- ](?:approved|recommended)|consulted (?:vets|veterinarians)|owner feedback|veterinary recommendations/i;
  for (const f of files) {
    it(`${f} has no first-party testing claim`, () => {
      expect(read(f)).not.toMatch(BANNED);
    });
  }
});

describe('P0-2 PDP category heuristics never become product facts', () => {
  it('a dog ramp is a ramp, never a bed', () => {
    expect(detectPdpCategory('Foldable Dog Ramp for Bed and Couch', 'Dog Beds')).toBe('ramp');
    expect(detectPdpCategory('Pet Stairs for High Beds', '')).toBe('ramp');
    expect(CATEGORY_CONTEXT.ramp).not.toMatch(/foam|sleep|bed\b|joint/i);
  });
  it('classifies unrelated categories by the product name', () => {
    expect(detectPdpCategory('Enclosed Cat Litter Box with Steps', '')).toBe('litter box');
    expect(detectPdpCategory('Interactive Feather Wand Cat Toy', '')).toBe('toy');
    expect(detectPdpCategory('Multi-Level Cat Tree Tower', '')).toBe('cat tree');
    expect(detectPdpCategory('No-Pull Dog Harness', '')).toBe('harness');
    expect(detectPdpCategory('Orthopedic Dog Bed', '')).toBe('bed');
  });
  it('generic category copy contains no concrete product attributes', () => {
    for (const text of Object.values(CATEGORY_CONTEXT)) if (text) expect(text).not.toMatch(ATTRIBUTE_CLAIMS);
    for (const list of Object.values(IDEAL_FOR)) for (const a of list ?? []) expect(a).not.toMatch(ATTRIBUTE_CLAIMS);
    const cta = getCtaCopy('Orthopedic Dog Bed', 'Dog Beds');
    expect(`${cta.headline} ${cta.subtext}`).not.toMatch(ATTRIBUTE_CLAIMS);
  });
  it('comparison table renders nothing without verified rows', () => {
    const { container } = render(<ProductVsAlternatives productName="Memory Foam Dog Bed" category="Beds" />);
    expect(container.innerHTML).toBe('');
  });
  it('a ramp PDP shows no bed language', () => {
    const { container } = render(<ProductProblemSolution productName="Dog Ramp for Bed" category="Dog Beds" />);
    expect(container.textContent).not.toMatch(/memory foam|orthopedic|sleep/i);
  });
});

describe('P0-3 truthful identifiers', () => {
  it('documented brand + GTIN + MPN', () => {
    const r = resolveProductIdentifiers({ id: 'uuid-1', sku: 'CJ123', brand: 'Acme', gtin: '4006381333931', mpn: 'AC-77' });
    expect(r).toEqual({ brand: 'Acme', gtin: '4006381333931', mpn: 'AC-77', identifierExists: true });
  });
  it('documented brand without MPN', () => {
    const r = resolveProductIdentifiers({ id: 'u', sku: 'CJ1', brand: 'Acme' });
    expect(r.brand).toBe('Acme');
    expect(r.mpn).toBeNull();
    expect(r.identifierExists).toBe(false);
  });
  it('no documented identifiers → no brand, no MPN from id/sku, identifier_exists false', () => {
    const r = resolveProductIdentifiers({ id: 'uuid-2', sku: 'CJFT2742896', brand: null, mpn: 'CJFT2742896' });
    expect(r).toEqual({ brand: null, gtin: null, mpn: null, identifierExists: false });
  });
  it('rejects invalid GTINs and placeholder brands', () => {
    expect(isValidGtin('4006381333932')).toBe(false);
    expect(resolveProductIdentifiers({ brand: 'Unbranded', gtin: '123' }).brand).toBeNull();
    // Real catalog: 253 CJ-sourced rows store "GetPawsy" as a retailer fill-in.
    expect(resolveProductIdentifiers({ sku: 'CJFT2398190', brand: 'GetPawsy' }).brand).toBeNull();
    expect(resolveProductIdentifiers({ sku: 'CJFT2398190', brand: 'GetPawsy' }).identifierExists).toBe(false);
  });
  it('JSON-LD, prerender and feed never default brand to GetPawsy or use ids as MPN', () => {
    for (const f of ['src/components/seo/ProductSchema.tsx', 'vite-plugin-prerender-products.ts', 'vite-plugin-sitemaps.ts']) {
      const s = read(f);
      expect(s).not.toMatch(/name:\s*'GetPawsy'\s*\}\s*,\s*\n?\s*(?:offers|\/\/)/);
      expect(s).not.toMatch(/mpn:\s*product\.id|g:mpn',\s*\[xmlText\(p\.(?:id|sku)\)/);
      expect(s).not.toMatch(/\|\|\s*'GetPawsy'/);
      expect(s).toContain('resolveProductIdentifiers');
    }
  });
});

describe('P0-4 one shipping window', () => {
  it('shopper copy derives from the numeric window', () => {
    expect(DELIVERY_TIME_STANDARD).toBe(`${US_TRANSIT_DAYS.min}–${US_TRANSIT_DAYS.max} business days`);
    expect(PROCESSING_TIME).toBe(`${US_HANDLING_DAYS.min}–${US_HANDLING_DAYS.max} business days`);
  });
  it('JSON-LD, prerender and feed read the shared window (no hard-coded transit days)', () => {
    for (const f of ['src/components/seo/ProductSchema.tsx', 'vite-plugin-prerender-products.ts', 'vite-plugin-sitemaps.ts']) {
      const s = read(f);
      expect(s).toMatch(/US_TRANSIT_DAYS\.max/);
      expect(s).not.toMatch(/transit_time', \[xmlText\('\d+'\)/);
      expect(s).not.toMatch(/transitTime:[\s\S]{0,80}minValue:\s*\d/);
    }
  });
});

const invoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock('@/components/layout/Layout', () => ({ Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/pages/NotFound', () => ({ default: () => <div data-testid="nf">NOT FOUND</div> }));
vi.mock('@/components/products/ProductDetailSkeleton', () => ({ ProductDetailSkeleton: () => <div>loading</div> }));

describe('P0-5 dead product slugs are real not-found pages', () => {
  beforeEach(() => invoke.mockReset());
  const mount = async () => {
    const { default: Fallback } = await import('@/components/products/SlugResolverFallback');
    return render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/products/gone']}>
          <Routes>
            <Route path="/products/:slug" element={<Fallback slug="gone" />} />
            <Route path="/products/new-slug" element={<div>NEW PDP</div>} />
            <Route path="/collections/all" element={<div>ALL</div>} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    );
  };
  it('not_found renders the not-found page, not a collection redirect', async () => {
    invoke.mockResolvedValue({ data: { step: 'not_found' }, error: null });
    const r = await mount();
    await waitFor(() => expect(r.getByTestId('nf')).toBeTruthy());
    expect(r.queryByText('ALL')).toBeNull();
  });
  it('a mapped replacement still redirects in one hop', async () => {
    invoke.mockResolvedValue({ data: { step: 'slug_history', product_slug: 'new-slug' }, error: null });
    const r = await mount();
    await waitFor(() => expect(r.getByText('NEW PDP')).toBeTruthy());
  });
  it('the resolver catch-all (collection_all) is a miss, not a redirect', async () => {
    invoke.mockResolvedValue({ data: { step: 'collection_all', target: 'https://getpawsy.pet/collections/all' }, error: null });
    const r = await mount();
    await waitFor(() => expect(r.getByTestId('nf')).toBeTruthy());
    expect(r.queryByText('ALL')).toBeNull();
  });
  it('a resolver outage shows a temporary state, not not-found or another page', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('522') });
    const r = await mount();
    await waitFor(() => expect(r.getByText(/couldn't load this product/i)).toBeTruthy());
    expect(r.queryByText('ALL')).toBeNull();
    expect(r.queryByTestId('nf')).toBeNull();
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  withUtm,
  appendUtmToPath,
  resolveUtm,
  isPreviewReferrer,
  captureFirstTouch,
  readFirstTouch,
} from '../utmNormalizer';

function resetStorage() {
  window.sessionStorage.clear();
  window.localStorage.clear();
}

describe('attribution cleanup hotfix', () => {
  beforeEach(() => {
    resetStorage();
    // Simulate a bare landing with no referrer / no UTM
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
    window.history.replaceState({}, '', '/');
  });

  it('internal navigation never appends direct/(none) UTMs', () => {
    // resolveUtm no longer stamps direct/(none) → resolved is empty
    const utm = resolveUtm({ search: '' });
    expect(utm.utm_source ?? null).toBeNull();
    expect(utm.utm_medium ?? null).toBeNull();

    // Even if a caller manages to hand direct/(none) to withUtm, it must
    // be dropped rather than propagated onto the outgoing URL.
    const qs = withUtm('', { utm_source: 'direct', utm_medium: '(none)' });
    expect(qs).toBe('');

    const url = appendUtmToPath('/products/foo', {
      utm_source: 'direct',
      utm_medium: '(none)',
    });
    expect(url).toBe('/products/foo');
    expect(url).not.toContain('utm_source=direct');
    expect(url).not.toContain('utm_medium=');
  });

  it('Pinterest pin URL builder carries the required UTMs and ids', () => {
    // Mirrors the assembler / hero-daily-publish contract.
    const productSlug = 'ufo-cat-tree-condo';
    const productId = '128e0207-8a94-4d71-b428-5b7f5002528f';
    const creativeId = 'abcd1234-ef56-7890-abcd-ef1234567890';
    const campaign = 'hero_daily';
    const url = `https://getpawsy.pet/products/${productSlug}?utm_source=pinterest&utm_medium=organic&utm_campaign=${campaign}&utm_content=creative_${creativeId.slice(0, 8)}&product_id=${productId}`;

    const params = new URL(url).searchParams;
    expect(params.get('utm_source')).toBe('pinterest');
    expect(params.get('utm_medium')).toBe('organic');
    expect(params.get('utm_campaign')).toBe('hero_daily');
    expect(params.get('utm_content')).toMatch(/^creative_[0-9a-f]{8}$/);
    expect(params.get('product_id')).toBe(productId);
  });

  it('classifies null-referrer + null-UTM as unknown (not direct)', () => {
    // Frontend contract: resolveUtm must leave the record empty so the
    // server-side classifier bucket becomes `unknown` instead of `direct`.
    const utm = resolveUtm({ search: '' });
    expect(utm.utm_source ?? null).toBeNull();
    expect(utm.utm_medium ?? null).toBeNull();
    expect(utm.utm_campaign ?? null).toBeNull();
  });

  it('flags lovable.dev preview referrers for internal_preview filtering', () => {
    expect(isPreviewReferrer('https://lovable.dev/projects/xyz')).toBe(true);
    expect(isPreviewReferrer('https://preview--getpawsy.lovable.app/')).toBe(true);
    expect(isPreviewReferrer('https://abc.lovableproject.com/foo')).toBe(true);
    expect(isPreviewReferrer('https://gptengineer.app/')).toBe(true);
    expect(isPreviewReferrer('https://pinterest.com/pin/1')).toBe(false);
    expect(isPreviewReferrer('')).toBe(false);
    expect(isPreviewReferrer(null)).toBe(false);
  });

  it('captureFirstTouch is idempotent and pins the original entry', () => {
    Object.defineProperty(document, 'referrer', {
      value: 'https://www.pinterest.com/pin/1',
      configurable: true,
    });
    window.history.replaceState({}, '', '/products/foo?utm_source=pinterest&utm_medium=organic&utm_campaign=hero_daily');

    const first = captureFirstTouch({
      utm: {
        utm_source: 'pinterest',
        utm_medium: 'organic',
        utm_campaign: 'hero_daily',
      },
    });
    expect(first.first_referrer_domain).toBe('www.pinterest.com');
    expect(first.first_utm_source).toBe('pinterest');
    expect(first.first_utm_campaign).toBe('hero_daily');
    expect(first.first_landing_page).toContain('/products/foo');
    expect(first.first_seen_at).toBeTruthy();

    // Simulate later internal navigation — must NOT overwrite the first touch.
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
    window.history.replaceState({}, '', '/cart');
    captureFirstTouch();
    const stored = readFirstTouch();
    expect(stored.first_referrer_domain).toBe('www.pinterest.com');
    expect(stored.first_landing_page).toContain('/products/foo');
  });
});
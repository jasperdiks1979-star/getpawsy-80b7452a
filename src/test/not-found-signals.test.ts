import { describe, it, expect } from 'vitest';
import { applyNotFoundSignals } from '@/lib/notFoundSignals';

const setup = () => {
  document.head.innerHTML =
    '<meta name="robots" content="index, follow, max-image-preview:large">' +
    '<meta name="robots" content="noindex, nofollow" data-rh="true">' +
    '<meta name="googlebot" content="index, follow">' +
    '<link rel="canonical" id="gp-canonical" href="https://getpawsy.pet/products/does-not-exist">';
};
const robots = () =>
  [...document.querySelectorAll('meta[name="robots"], meta[name="googlebot"]')].map((m) =>
    m.getAttribute('content'),
  );

describe('applyNotFoundSignals', () => {
  it('leaves only noindex,nofollow and no canonical href on a 404', () => {
    setup();
    applyNotFoundSignals(document);
    expect(robots()).toEqual(['noindex, nofollow', 'noindex, nofollow', 'noindex, nofollow']);
    expect(document.querySelector('link[rel="canonical"]')?.hasAttribute('href')).toBe(false);
  });

  it('restores the shell tags when leaving the 404 (SPA navigation)', () => {
    setup();
    const restore = applyNotFoundSignals(document);
    restore();
    expect(robots()).toEqual([
      'index, follow, max-image-preview:large',
      'noindex, nofollow',
      'index, follow',
    ]);
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://getpawsy.pet/products/does-not-exist',
    );
  });
});

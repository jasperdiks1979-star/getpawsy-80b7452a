import { describe, it, expect } from 'vitest';
import { applyNotFoundSignals } from '@/lib/notFoundSignals';

describe('applyNotFoundSignals', () => {
  it('removes the conflicting index robots tag and the self-canonical', () => {
    document.head.innerHTML =
      '<meta name="robots" content="index, follow, max-image-preview:large">' +
      '<meta name="robots" content="noindex, nofollow" data-rh="true">' +
      '<meta name="googlebot" content="index, follow">' +
      '<link rel="canonical" id="gp-canonical" href="https://getpawsy.pet/products/does-not-exist">';
    applyNotFoundSignals(document);
    const robots = [...document.querySelectorAll('meta[name="robots"], meta[name="googlebot"]')].map(
      (m) => m.getAttribute('content'),
    );
    expect(robots).toEqual(['noindex, nofollow', 'noindex, nofollow', 'noindex, nofollow']);
    expect(document.querySelector('link[rel="canonical"]')?.hasAttribute('href')).toBe(false);
  });
});

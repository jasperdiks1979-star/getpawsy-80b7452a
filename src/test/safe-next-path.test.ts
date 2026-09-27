import { describe, it, expect } from 'vitest';
import { safeNextPath } from '@/lib/safeNextPath';

const O = 'https://getpawsy.pet';

describe('safeNextPath', () => {
  it.each([
    ['/', '/'],
    ['/account', '/account'],
    ['/admin/orders?tab=open', '/admin/orders?tab=open'],
    ['/products/x#reviews', '/products/x#reviews'],
  ])('keeps internal path %s', (input, out) => {
    expect(safeNextPath(input, O)).toBe(out);
  });

  it.each([
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/%5Cevil.example',
    'https://evil.example',
    'http:evil.example',
    'javascript:alert(1)',
    'data:text/html,x',
    '/\t/evil.example',
    '/\n/evil.example',
    ' //evil.example',
    'evil.example',
    '',
    null,
    undefined,
  ])('rejects %j', (input) => {
    const r = safeNextPath(input as string, O);
    expect(r === '/' || new URL(r, O).origin === O).toBe(true);
    expect(r.startsWith('//')).toBe(false);
  });

  it('decoded encoded payload (as delivered by URLSearchParams) is rejected', () => {
    const next = new URLSearchParams('next=%2F%2Fevil.example').get('next');
    expect(safeNextPath(next, O)).toBe('/');
    const bs = new URLSearchParams('next=%2F%5Cevil.example').get('next');
    expect(safeNextPath(bs, O)).toBe('/');
  });

  it('hard rejects to "/" for hostile examples', () => {
    for (const v of ['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)']) {
      expect(safeNextPath(v, O)).toBe('/');
    }
  });
});

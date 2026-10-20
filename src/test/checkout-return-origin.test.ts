import { describe, expect, it } from 'vitest';
import { resolveCheckoutReturnOrigin as resolve } from '../../supabase/functions/_shared/checkout-return-origin.ts';

describe('staged live checkout return origin', () => {
  it('pins localhost live requests to canonical production', () => {
    expect(resolve('live', 'http://localhost:8080', null, null)).toBe('https://getpawsy.pet');
  });
  it('ignores cross-origin headers and configured base in live mode', () => {
    expect(resolve('live', 'https://attacker.example', 'https://attacker.example/path', 'http://localhost:8080')).toBe('https://getpawsy.pet');
  });
  it('retains first-party live origin', () => {
    expect(resolve('live', 'https://getpawsy.pet', null, null)).toBe('https://getpawsy.pet');
  });
  it('permits localhost only in explicit test mode', () => {
    expect(resolve('test', 'http://localhost:8080/products', null, null)).toBe('http://localhost:8080');
  });
  it('permits HTTPS preview only in explicit test mode', () => {
    expect(resolve('test', null, 'https://isolated.lovable.app/product', null)).toBe('https://isolated.lovable.app');
  });
  it('fails closed for unknown mode before checkout side effects', () => {
    expect(() => resolve('unknown', 'http://localhost:8080', null, null)).toThrow('checkout_mode_unknown');
    expect(() => resolve('', null, null, null)).toThrow('checkout_mode_unknown');
  });
  it('rejects foreign test destinations and unsafe protocols', () => {
    expect(resolve('test', 'https://attacker.example', 'javascript:alert(1)', 'http://foreign.example')).toBe('https://getpawsy.pet');
  });
  it('normalizes approved origins without query, path or credentials', () => {
    expect(resolve('test', 'http://127.0.0.1:8080/path?secret=x', null, null)).toBe('http://127.0.0.1:8080');
    expect(resolve('test', 'https://user:pass@isolated.lovable.app', null, null)).toBe('https://getpawsy.pet');
  });
});
import { readFileSync } from 'node:fs';
describe('create-checkout wiring', () => {
  const src = readFileSync('supabase/functions/create-checkout/index.ts', 'utf8');
  it('resolves the return origin from key mode before any customer or order work', () => {
    const resolveAt = src.indexOf('resolveCheckoutReturnOrigin(');
    expect(resolveAt).toBeGreaterThan(-1);
    expect(resolveAt).toBeLessThan(src.indexOf('createClient('));
    expect(src).not.toMatch(/rawOrigin \|\|/);
  });
});
describe('create-checkout pending order typing', () => {
  const src = readFileSync('supabase/functions/create-checkout/index.ts', 'utf8');
  it('inserted pending order reads back the same columns as the reuse lookup', () => {
    expect(src).toMatch(/\.insert\(orderRow\)\.select\("id, payment_status"\)/);
  });
  it('still fails closed when the order cannot be recorded', () => {
    expect(src).toMatch(/if \(orderError \|\| !pendingOrder\?\.id\)/);
  });
});

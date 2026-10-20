import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
const read = (p: string) => readFileSync(p, 'utf8');
const files = ['src/pages/ReturnPolicy.tsx','src/components/products/ProductShippingReturns.tsx','src/pages/collections/OrthopedicDogBeds.tsx','src/pages/collections/CatTreesForLargeCats.tsx'];
describe('return procedure copy', () => {
  it('returns page and PDP give order-specific address instructions', () => {
    const phrase = "we'll provide instructions and any authorized return address for your specific order";
    expect(read(files[0])).toContain(phrase);
    expect(read(files[1])).toContain(phrase);
  });
  it('keeps 30-day window and merchant-paid defect returns', () => {
    expect(read('src/lib/shipping-constants.ts')).toContain('RETURN_WINDOW_DAYS = 30');
    expect(read(files[0])).toContain('GetPawsy covers the return shipping cost');
  });
  it('no absolute approval or customer-always-pays claims', () => {
    for (const f of files) {
      const t = read(f);
      expect(t).not.toMatch(/No questions/);
      expect(t).not.toMatch(/customer is responsible for return shipping/);
      expect(t).not.toMatch(/replaced free of charge/);
    }
  });
});

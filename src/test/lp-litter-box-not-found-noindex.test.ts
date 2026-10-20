import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('/lp/cat-litter-box missing-product state', () => {
  it('marks the "Product Not Found" state noindex', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../pages/landing/CatLitterBoxLanding.tsx'), 'utf-8');
    const branch = src.slice(src.indexOf('if (!product) {\n    return'), src.indexOf('Product Not Found</h1>'));
    expect(branch).toContain('<meta name="robots" content="noindex, follow" />');
  });
});

/**
 * Locks the fix for three exposure findings:
 *  - catalog_classification_variants / _runs readable by any signed-in user
 *  - product-media CJ videos downloadable by anyone
 * Storefront videos are delivered via signed URLs, which do not need a read policy.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = resolve('drizzle/migrations');
const body = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(resolve(dir, f), 'utf8')).join('\n');

describe('three security findings stay closed', () => {
  it.each(['auth read cv', 'auth read runs', 'Public read product-media cj videos only'])(
    'drops permissive policy "%s"',
    (name) => {
      expect(body).toContain(`DROP POLICY IF EXISTS "${name}"`);
    },
  );
  it('replacement read policies are admin-only', () => {
    for (const n of ['Admins read cv', 'Admins read runs', 'Admins read product-media']) {
      const m = body.match(new RegExp(`CREATE POLICY "${n}"[^;]*;`));
      expect(m?.[0]).toMatch(/has_role\(auth\.uid\(\), 'admin'/);
      expect(m?.[0]).not.toMatch(/\banon\b|USING \(true\)/);
    }
  });
});

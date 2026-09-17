/**
 * Public product option-metadata boundary (visibility-gap repair).
 *
 * `products_public` hides products the storefront must not list (out of stock,
 * duplicates, inactive). That also hid the enclosed litter box from the cart's
 * option check, so the storefront could not know whether an option was required
 * before checkout. `product_option_metadata(p_ids)` closes that gap with an
 * id-scoped, read-only projection.
 *
 * These tests lock the contract: option fields only, no catalog enumeration,
 * inactive/duplicate products still hidden, and the cart guard must use the RPC.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { cartLineNeedsVariantChoice, resolveQuickAddPlan } from '@/lib/quickAdd';

function readMigrationSql(): string {
  const dirs = ['drizzle/migrations', 'supabase/migrations'];
  let body = '';
  for (const dir of dirs) {
    let files: string[] = [];
    try {
      files = readdirSync(resolve(dir)).filter((f) => f.endsWith('.sql'));
    } catch {
      continue;
    }
    for (const f of files) body += `\n${readFileSync(resolve(dir, f), 'utf8')}`;
  }
  return body;
}

const SQL = readMigrationSql();
const FN = /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.product_option_metadata[\s\S]*?\$\$;/i;

describe('product_option_metadata RPC contract', () => {
  const fn = SQL.match(FN)?.[0] ?? '';

  it('exists as a security-definer, id-scoped read', () => {
    expect(fn, 'product_option_metadata migration missing').not.toBe('');
    expect(fn).toMatch(/SECURITY\s+DEFINER/i);
    expect(fn).toMatch(/STABLE/i);
    expect(fn).toMatch(/p\.id\s*=\s*ANY\(/i);
  });

  it('keeps inactive and duplicate products hidden', () => {
    expect(fn).toMatch(/p\.is_active\s*=\s*true/i);
    expect(fn).toMatch(/COALESCE\(p\.is_duplicate,\s*false\)\s*=\s*false/i);
  });

  it('covers products the catalog view hides for stock reasons', () => {
    // No stock predicate: an active, out-of-stock product (the enclosed litter
    // box) must still be readable for the option check.
    expect(fn).not.toMatch(/p\.stock\s*>\s*0/i);
  });

  it('exposes no pricing, cost, supplier or admin fields', () => {
    const forbidden = [
      'cost_price',
      'supplier_name',
      'supplier_warehouse',
      'cj_product_id',
      'price',
      'compare_at_price',
      'merch_hidden',
      'dedupe_key',
    ];
    for (const field of forbidden) {
      expect(fn.toLowerCase(), `RPC must not expose ${field}`).not.toContain(field);
    }
  });

  it('is granted read-only execute to storefront roles only', () => {
    expect(SQL).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.product_option_metadata\(uuid\[\]\)\s+TO\s+anon,\s*authenticated,\s*service_role;/i,
    );
    expect(SQL).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.product_option_metadata\(uuid\[\]\)\s+FROM\s+PUBLIC;/i,
    );
    // No write grants anywhere for the storefront roles on this path.
    expect(SQL).not.toMatch(
      /GRANT\s+(INSERT|UPDATE|DELETE|ALL)[^;]*ON\s+FUNCTION\s+public\.product_option_metadata/i,
    );
  });
});

describe('cart-side option check uses the gap-free source', () => {
  const cart = readFileSync(resolve('src/contexts/CartContext.tsx'), 'utf8');
  const hook = readFileSync(resolve('src/hooks/useCartVariantIssues.ts'), 'utf8');
  const helper = readFileSync(resolve('src/lib/productOptionMetadata.ts'), 'utf8');

  it('central cart guard reads the option RPC, not the filtered catalog view', () => {
    expect(cart).toMatch(/product_option_metadata/);
    expect(cart).not.toMatch(/from\(['"]products_public['"]\)/);
  });

  it('cart recovery hook reads the option RPC too', () => {
    expect(hook).toMatch(/fetchProductOptionMetadata/);
    expect(hook).not.toMatch(/products_public/);
    expect(helper).toMatch(/product_option_metadata/);
  });
});

describe('option enforcement behaviour is unchanged by the fix', () => {
  const PID = '11111111-2222-4333-8444-555555555555';
  const product = (variants: unknown) => ({
    id: PID,
    slug: 'p',
    name: 'P',
    price: 10,
    image_url: '/i.jpg',
    variants,
  });

  it('multi-option product added outside the PDP cannot enter the cart bare', () => {
    const plan = resolveQuickAddPlan(
      product([
        { vid: 'A', variantStock: 3 },
        { vid: 'B', variantStock: 4 },
      ]),
    );
    expect(plan.kind).toBe('choose');
    expect(cartLineNeedsVariantChoice(PID, [{ vid: 'A' }, { vid: 'B' }])).toBe(true);
  });

  it('single-option product still adds normally with its exact variant', () => {
    const plan = resolveQuickAddPlan(product([{ vid: 'A', variantStock: 3 }]));
    expect(plan.kind).toBe('add');
    if (plan.kind !== 'add') return;
    expect(plan.item.id).toBe(`${PID}-A`);
  });

  it('a line that already carries an exact option is never re-prompted', () => {
    expect(cartLineNeedsVariantChoice(`${PID}-A`, [{ vid: 'A' }, { vid: 'B' }])).toBe(false);
  });
});

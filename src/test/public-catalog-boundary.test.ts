/**
 * Public catalog exposure boundary.
 *
 * `products_public` used to run with the view owner's privileges, which meant
 * the anonymous storefront key could read every row in `products` — retired,
 * inactive and duplicate items included, along with internal supplier fields.
 * These tests lock the fix: all shopper-facing catalog views must run as the
 * querying user so row level security applies.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATIONS = resolve('supabase/migrations');
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
const sql = files.map((f) => ({ f, body: readFileSync(resolve(MIGRATIONS, f), 'utf8') }));

const SHOPPER_VIEWS = ['products_public', 'products_detail', 'products_shop'];

/** Last statement in migration order that sets security_invoker for a view. */
function lastInvokerSetting(view: string): string | null {
  let value: string | null = null;
  const re = new RegExp(
    `(?:ALTER\\s+VIEW|CREATE\\s+(?:OR\\s+REPLACE\\s+)?VIEW)\\s+(?:public\\.)?${view}\\b[\\s\\S]*?security_invoker\\s*=\\s*(on|true|off|false)`,
    'gi',
  );
  for (const { body } of sql) {
    for (const m of body.matchAll(re)) value = m[1].toLowerCase();
  }
  return value;
}

describe('public catalog exposure boundary', () => {
  it.each(SHOPPER_VIEWS)('%s runs as the querying user, not the view owner', (view) => {
    const setting = lastInvokerSetting(view);
    expect(setting, `${view} never has security_invoker enabled in any migration`).not.toBeNull();
    expect(['on', 'true']).toContain(setting);
  });

  it('no migration turns security_invoker back off for a shopper-facing view', () => {
    for (const view of SHOPPER_VIEWS) {
      expect(lastInvokerSetting(view)).not.toMatch(/off|false/);
    }
  });

  it('the catalog views never grant write access to shoppers', () => {
    const bad: string[] = [];
    for (const { f, body } of sql) {
      for (const m of body.matchAll(
        /GRANT\s+([^;]*?)\s+ON\s+(?:TABLE\s+)?(?:public\.)?(products_public|products_detail|products_shop)\s+TO\s+([^;]+);/gi,
      )) {
        const privileges = m[1].toUpperCase();
        const roles = m[3].toLowerCase();
        const shopperRole = /\banon\b|\bauthenticated\b/.test(roles);
        const writes = /INSERT|UPDATE|DELETE|ALL/.test(privileges);
        if (shopperRole && writes) bad.push(`${f}: ${m[0].trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

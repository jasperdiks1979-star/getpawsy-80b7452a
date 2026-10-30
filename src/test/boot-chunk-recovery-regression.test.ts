import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const cart = readFileSync(resolve(process.cwd(), 'src/contexts/CartContext.tsx'), 'utf8');

describe('boot / lazy route recovery regression', () => {
  it('uses one session-wide guard instead of a second per-route guard', () => {
    expect(html).toContain("var RELOAD_GUARD_KEY = 'gp_reload_guard_v2'");
    expect(html).toContain('window.__doChunkReload__ = doChunkReload');
    expect(app).toContain('boot.__doChunkReload__()');
    expect(app).not.toContain('"chunk-reload-" + window.location.pathname');
  });

  it('retains UTM, referral and hash on cache-busting reloads', () => {
    expect(html).toContain('new URL(window.location.href)');
    expect(html).toContain("retryUrl.searchParams.set('cb', String(Date.now()))");
    expect(html).toContain('retryUrl.pathname + retryUrl.search + retryUrl.hash');
    expect(app).toContain('retryUrl.pathname + retryUrl.search + retryUrl.hash');
  });

  it('never silently substitutes no-op cart methods or loops on missing provider', () => {
    const hook = cart.slice(cart.indexOf('export const useCart = () =>'));
    expect(hook).toContain("throw new Error('useCart must be used within a CartProvider')");
    expect(hook).not.toContain('window.location.reload()');
    expect(hook).not.toContain('addItem: () => {}');
  });
});

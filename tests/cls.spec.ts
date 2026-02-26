/**
 * CLS smoke test — asserts layout shift stays below hard threshold
 * on key routes after hydration.
 *
 * Requires: Playwright + the app running with CLS guard enabled
 * (default in dev/preview).
 *
 * Run: npx playwright test tests/cls.spec.ts
 */
import { test, expect } from '@playwright/test';

const HARD_THRESHOLD = 0.12;
const ROUTES = ['/', '/collections', '/cart'];

for (const route of ROUTES) {
  test(`CLS < ${HARD_THRESHOLD} on ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });

    // Allow hydration + late shifts to settle
    await page.waitForTimeout(3000);

    const cls = await page.evaluate(() => (window as any).__CLS__);

    // __CLS__ might be undefined if guard isn't running (prod build) — skip gracefully
    if (cls === undefined) {
      test.skip();
      return;
    }

    console.log(`[CLS] ${route} → ${cls.toFixed(4)}`);
    expect(cls).toBeLessThan(HARD_THRESHOLD);
  });
}

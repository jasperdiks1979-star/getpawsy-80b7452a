/**
 * CLS smoke test — asserts layout shift stays below hard threshold
 * on key routes after hydration.
 *
 * Emulates mobile viewport (390×844) with slow 4G throttling.
 *
 * Run: npx playwright test tests/cls.spec.ts
 */
import { test, expect } from '@playwright/test';

const HARD_THRESHOLD = 0.12;
const ROUTES = ['/', '/collections', '/cart'];

test.use({
  viewport: { width: 390, height: 844 },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});

for (const route of ROUTES) {
  test(`CLS < ${HARD_THRESHOLD} on ${route} (mobile)`, async ({ page, context }) => {
    // Throttle to slow 4G via CDP
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (1.6 * 1024 * 1024) / 8, // 1.6 Mbps
      uploadThroughput: (750 * 1024) / 8,
      latency: 150,
    });

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

  test(`No geometry mismatch on ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const mismatch = await page.evaluate(
      () => (window as any).__CLS_GUARD__?.geometryMismatch
    );

    if (mismatch === undefined) {
      test.skip();
      return;
    }

    expect(mismatch).toBe(false);
  });
}

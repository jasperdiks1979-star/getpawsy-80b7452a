import { expect, test } from '@playwright/test';

test('missing app chunks trigger one bounded reload without losing attribution', async ({ page }) => {
  let failedChunks = 0;
  await page.route('**/assets/*.js', async (route) => {
    failedChunks++;
    await route.abort('failed');
  });

  // waitUntil=commit avoids racing the intentional immediate recovery redirect.
  await page.goto('/?utm_source=pinterest&utm_medium=social&epik=sample#details', {
    waitUntil: 'commit',
  });

  await expect.poll(() => new URL(page.url()).searchParams.get('cb'), {
    timeout: 15_000,
  }).not.toBeNull();

  const retried = new URL(page.url());
  expect(retried.searchParams.get('utm_source')).toBe('pinterest');
  expect(retried.searchParams.get('utm_medium')).toBe('social');
  expect(retried.searchParams.get('epik')).toBe('sample');
  expect(retried.hash).toBe('#details');
  expect(failedChunks).toBeGreaterThan(0);

  await expect(page.locator('#chunk-recovery')).toBeVisible({ timeout: 15_000 });
  const retryStamp = new URL(page.url()).searchParams.get('cb');
  await page.waitForTimeout(4_500);
  expect(new URL(page.url()).searchParams.get('cb')).toBe(retryStamp);
});

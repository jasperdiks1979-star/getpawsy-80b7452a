// Read-only/ephemeral live browser smoke. NEVER submits checkout or creates orders.
import { chromium, devices, expect } from '@playwright/test';

const origin = 'https://getpawsy.pet';
const slug = 'cat-double-bowl-cat-food-bowl-protects-cervical-vertebra';
const productName = /Elevated Cat Bowl/i;
const browser = await chromium.launch({ headless: true });
let failures = 0;

async function check(label, device) {
  const context = await browser.newContext({ ...device, serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message.slice(0, 250)));
  page.on('response', response => {
    if (response.status() >= 500 && response.url().startsWith(origin)) {
      errors.push(`HTTP ${response.status()} ${response.url().slice(0, 180)}`);
    }
  });
  try {
    const home = await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (!home || home.status() >= 400) throw new Error(`Homepage HTTP ${home?.status()}`);
    await expect(page.locator('#root')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/We couldn't reach the server/i)).toHaveCount(0);
    console.log(`[${label}] homepage HTTP ${home.status()}`);

    const pdp = await page.goto(origin + '/products/' + slug, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (!pdp || pdp.status() >= 400) throw new Error(`PDP HTTP ${pdp?.status()}`);
    await expect(page.getByRole('heading', { name: productName }).first()).toBeVisible({ timeout: 30_000 });
    const add = page.getByRole('button', { name: /add to cart/i }).first();
    await expect(add).toBeEnabled({ timeout: 25_000 });
    await add.click();
    await page.goto(origin + '/cart', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.getByText(productName).first()).toBeVisible({ timeout: 20_000 });
    console.log(`[${label}] product, add-to-cart and cart item visible`);

    await page.goto(origin + '/checkout', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.getByLabel('Email Address', { exact: true })).toBeVisible({ timeout: 20_000 });
    console.log(`[${label}] checkout form visible; NO payment or checkout request submitted`);

    await page.goto(origin + '/admin', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.locator('#root')).toBeVisible({ timeout: 20_000 });
    console.log(`[${label}] admin route loaded (authentication not tested)`);
    console.log(`[${label}] observed page errors: ${JSON.stringify(errors.slice(0, 10))}`);
  } catch (err) {
    failures++;
    console.error(`[${label}] FAILED: ${err?.stack || err}`);
    console.error(`[${label}] page errors: ${JSON.stringify(errors.slice(0, 10))}`);
  } finally {
    await context.close();
  }
}

try {
  await check('desktop', devices['Desktop Chrome']);
  await check('mobile', devices['Pixel 7']);
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;

// Read-only/ephemeral live browser smoke. NEVER submits checkout or creates orders.
import { chromium, devices, expect } from '@playwright/test';

const origin = 'https://getpawsy.pet';
const slug = 'cat-double-bowl-cat-food-bowl-protects-cervical-vertebra';
const productName = /Elevated Cat Bowl/i;
const browser = await chromium.launch({ headless: true });
let failures = 0;

async function check(label, device) {
  const context = await browser.newContext({ ...device, serviceWorkers: 'block' });
  // Install internal-traffic flags before the first live navigation. These are\n  // analytics markers only; they grant no admin or checkout privileges.\n  await context.addInitScript(() => {\n    try {\n      window.localStorage.setItem('gp_founder', '1');\n      window.localStorage.setItem('gp_internal', '1');\n    } catch { /* storage may be unavailable on blank documents */ }\n  });\n  const page = await context.newPage();
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
    await expect(page.locator('#root')).toBeVisible({ timeout: 25_000 });\n    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('gp_founder'))).toBe('1');\n    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('gp_internal'))).toBe('1');
    await expect(page.getByText(/We couldn't reach the server/i)).toHaveCount(0);
    console.log(`[${label}] homepage HTTP ${home.status()}`);

    const collection = await page.goto(origin + '/collections/cat', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (!collection || collection.status() >= 400) throw new Error(`Collection HTTP ${collection?.status()}`);
    await expect(page.locator('a[href*="/products/"]').first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText('Loading products...', { exact: true })).toHaveCount(0, { timeout: 20_000 });
    // Product links alone do not prove that prices have resolved from the backend.
    const cards = page.getByTestId('product-card');
    await expect(cards.first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[aria-label="Loading price"]')).toHaveCount(0, { timeout: 30_000 });
    await expect(cards.first()).toContainText(/\$\d{1,3}(?:,\d{3})*\.\d{2}/, { timeout: 15_000 });
    console.log(`[${label}] real product card and dollar price rendered; no price skeletons remain`);
    console.log(`[${label}] collection HTTP ${collection.status()}, product links rendered without stuck loading`);

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

    await page.goto(origin + '/cart', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByRole('button', { name: /Increase quantity of/i }).first().click();
    await page.getByRole('button', { name: /Decrease quantity of/i }).first().click();
    await page.getByRole('button', { name: /Remove .* from cart/i }).first().click();
    await expect(page.getByRole('heading', { name: /Your cart is empty|Nothing here yet/i })).toBeVisible({ timeout: 15_000 });
    console.log(`[${label}] cart quantity increase/decrease and removal verified`);

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

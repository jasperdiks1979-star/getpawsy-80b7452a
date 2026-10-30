import { test, expect } from '../playwright-fixture';

// Isolated UI contract. No production API, analytics, order or payment request
// may leave this browser. Live backend health is a separate release gate.
const product = {
  id: '00000000-0000-4000-8000-000000000023',
  name: 'Checkout fixture', slug: 'checkout-fixture', price: 40,
  quantity: 1, image: '', stock: 20, variants: [], supplier_warehouse: 'US',
};

test.describe('Checkout Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === 'http://localhost:8080' && request.method() === 'GET') {
        return route.continue();
      }
      const json = (data: unknown) => route.fulfill({
        status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data),
      });
      if (url.pathname === '/rest/v1/products' ||
          url.pathname === '/rest/v1/rpc/product_option_metadata') return json([product]);
      if (url.pathname === '/functions/v1/geo-classify') return json({ country: 'US' });
      // Fail closed, including same-origin writes and all payment calls.
      return route.abort();
    });
    await page.addInitScript(item => {
      localStorage.setItem('pawsy-cart', JSON.stringify([item]));
    }, product);
  });

  test('navigates from a populated cart to checkout', async ({ page }) => {
    await page.goto('/cart');
    await expect(page.getByText(product.name, { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Secure Checkout', exact: true }).click();
    await expect(page).toHaveURL(/\/checkout/);
    await expect(page.getByLabel('Email Address', { exact: true })).toBeVisible();
  });

  test('renders checkout summary and shipping destination', async ({ page }) => {
    await page.goto('/checkout');
    await expect(page.getByText(product.name, { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel('Email Address', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Ship to', { exact: true })).toHaveValue('US');
    await expect(page.locator('[data-testid^="checkout-cta-"]:visible').first()).toBeEnabled();
  });

  test('rejects missing email before calling checkout', async ({ page }) => {
    const invocations: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/create-checkout')) invocations.push(request.url());
    });
    await page.goto('/checkout');
    const button = page.locator('[data-testid^="checkout-cta-"]:visible').first();
    await expect(button).toBeEnabled();
    await button.click();
    await expect(page.getByText('Please enter a valid email address', { exact: true })).toBeVisible();
    expect(invocations).toEqual([]);
  });

  test('calculates cart totals and removes the line', async ({ page }) => {
    await page.goto('/cart');
    const subtotal = page.getByText('Subtotal', { exact: true }).locator('..');
    await expect(subtotal).toContainText('$40.00');
    await page.getByRole('button', { name: `Increase quantity of ${product.name}`, exact: true }).click();
    await expect(subtotal).toContainText('$80.00');
    await page.getByRole('button', { name: `Decrease quantity of ${product.name}`, exact: true }).click();
    await expect(subtotal).toContainText('$40.00');
    await page.getByRole('button', { name: `Remove ${product.name} from cart`, exact: true }).click();
    await expect(page.getByRole('heading', { name: /^(Your cart is empty|Nothing here yet)$/ })).toBeVisible();
    await expect(page.getByText(product.name, { exact: true })).toHaveCount(0);
  });
});

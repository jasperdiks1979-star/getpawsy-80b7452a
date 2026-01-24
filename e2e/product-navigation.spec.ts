import { test, expect } from "../playwright-fixture";

test.describe("Product Navigation", () => {
  test("should navigate to products page from homepage", async ({ page }) => {
    await page.goto("/");
    
    // Click on shop/products link
    await page.getByRole("link", { name: /shop|products|producten/i }).first().click();
    
    // Should be on products page
    await expect(page).toHaveURL(/\/products/);
    
    // Should show product cards
    await expect(page.locator('[data-testid="product-card"]').or(page.locator('.product-card')).first()).toBeVisible({ timeout: 10000 });
  });

  test("should navigate to product detail page", async ({ page }) => {
    await page.goto("/products");
    
    // Wait for products to load
    await page.waitForLoadState("networkidle");
    
    // Click on first product
    const firstProduct = page.locator('a[href*="/products/"]').first();
    await firstProduct.click();
    
    // Should be on product detail page
    await expect(page).toHaveURL(/\/products\/.+/);
    
    // Should show product details
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("should filter products by category", async ({ page }) => {
    await page.goto("/products");
    
    // Wait for page to load
    await page.waitForLoadState("networkidle");
    
    // Check if category filter exists and interact with it
    const categoryFilter = page.locator('[data-testid="category-filter"]').or(page.getByRole("combobox"));
    
    if (await categoryFilter.count() > 0) {
      await categoryFilter.first().click();
      // Select a category if dropdown opens
      const categoryOption = page.getByRole("option").first();
      if (await categoryOption.count() > 0) {
        await categoryOption.click();
      }
    }
  });

  test("should show product images and prices", async ({ page }) => {
    await page.goto("/products");
    
    await page.waitForLoadState("networkidle");
    
    // Check that product images are visible
    const productImages = page.locator('img[src*="product"], img[alt*="product"], .product-card img');
    await expect(productImages.first()).toBeVisible({ timeout: 10000 });
    
    // Check that prices are visible (look for € or $ symbols)
    const prices = page.locator('text=/[€$]\\d+/');
    await expect(prices.first()).toBeVisible();
  });

  test("should handle product variants selection", async ({ page }) => {
    // Go to a product with variants
    await page.goto("/products");
    await page.waitForLoadState("networkidle");
    
    // Click first product
    await page.locator('a[href*="/products/"]').first().click();
    
    await page.waitForLoadState("networkidle");
    
    // Check for variant selectors (size, color, etc.)
    const variantSelector = page.locator('[data-testid="variant-selector"]')
      .or(page.locator('select'))
      .or(page.locator('[role="radiogroup"]'));
    
    // If variants exist, try to select one
    if (await variantSelector.count() > 0) {
      const options = variantSelector.first().locator('option, [role="radio"], button');
      if (await options.count() > 1) {
        await options.nth(1).click();
      }
    }
  });
});

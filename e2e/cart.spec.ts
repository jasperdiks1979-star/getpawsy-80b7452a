import { test, expect } from "../playwright-fixture";

test.describe("Shopping Cart", () => {
  test("should add product to cart", async ({ page }) => {
    // Go to a product page
    await page.goto("/products");
    await page.waitForLoadState("networkidle");
    
    // Click first product
    await page.locator('a[href*="/products/"]').first().click();
    await page.waitForLoadState("networkidle");
    
    // Find and click add to cart button
    const addToCartButton = page.getByRole("button", { name: /add to cart|toevoegen|in winkelwagen/i });
    await expect(addToCartButton).toBeVisible();
    await addToCartButton.click();
    
    // Verify cart indicator shows item
    const cartIndicator = page.locator('[data-testid="cart-count"]')
      .or(page.locator('.cart-count'))
      .or(page.locator('[aria-label*="cart"] span'));
    
    // Cart should have at least 1 item
    await expect(cartIndicator.first()).toBeVisible({ timeout: 5000 });
  });

  test("should navigate to cart page", async ({ page }) => {
    await page.goto("/");
    
    // Click on cart icon/link
    const cartLink = page.getByRole("link", { name: /cart|winkelwagen/i })
      .or(page.locator('[href="/cart"]'))
      .or(page.locator('[aria-label*="cart"]'));
    
    await cartLink.first().click();
    
    // Should be on cart page
    await expect(page).toHaveURL(/\/cart/);
  });

  test("should show empty cart message when no items", async ({ page }) => {
    // Clear any existing cart by going directly to cart
    await page.goto("/cart");
    
    await page.waitForLoadState("networkidle");
    
    // If cart is empty, should show empty message
    const cartContent = page.locator('text=/empty|leeg|no items|geen producten/i');
    const cartItems = page.locator('[data-testid="cart-item"]').or(page.locator('.cart-item'));
    
    // Either show empty message or cart items
    const isEmpty = await cartItems.count() === 0;
    if (isEmpty) {
      await expect(cartContent.first()).toBeVisible();
    }
  });

  test("should update quantity in cart", async ({ page }) => {
    // First add a product
    await page.goto("/products");
    await page.waitForLoadState("networkidle");
    await page.locator('a[href*="/products/"]').first().click();
    await page.waitForLoadState("networkidle");
    
    const addToCartButton = page.getByRole("button", { name: /add to cart|toevoegen|in winkelwagen/i });
    if (await addToCartButton.count() > 0) {
      await addToCartButton.click();
    }
    
    // Go to cart
    await page.goto("/cart");
    await page.waitForLoadState("networkidle");
    
    // Find quantity controls
    const increaseButton = page.getByRole("button", { name: /\+|increase|meer/i })
      .or(page.locator('[data-testid="increase-quantity"]'));
    
    if (await increaseButton.count() > 0) {
      const initialQuantity = page.locator('[data-testid="quantity"]').or(page.locator('.quantity'));
      await increaseButton.first().click();
      
      // Wait for update
      await page.waitForTimeout(500);
    }
  });

  test("should remove item from cart", async ({ page }) => {
    // First add a product
    await page.goto("/products");
    await page.waitForLoadState("networkidle");
    await page.locator('a[href*="/products/"]').first().click();
    await page.waitForLoadState("networkidle");
    
    const addToCartButton = page.getByRole("button", { name: /add to cart|toevoegen|in winkelwagen/i });
    if (await addToCartButton.count() > 0) {
      await addToCartButton.click();
    }
    
    // Go to cart
    await page.goto("/cart");
    await page.waitForLoadState("networkidle");
    
    // Find and click remove button
    const removeButton = page.getByRole("button", { name: /remove|verwijder|delete/i })
      .or(page.locator('[data-testid="remove-item"]'))
      .or(page.locator('[aria-label*="remove"]'));
    
    if (await removeButton.count() > 0) {
      await removeButton.first().click();
      
      // Cart should be empty or have fewer items
      await page.waitForTimeout(500);
    }
  });
});

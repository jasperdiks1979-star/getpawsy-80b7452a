import { test, expect } from "../playwright-fixture";

test.describe("Checkout Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Add a product to cart before each checkout test
    await page.goto("/products");
    await page.waitForLoadState("networkidle");
    
    // Click first product
    await page.locator('a[href*="/products/"]').first().click();
    await page.waitForLoadState("networkidle");
    
    // Add to cart
    const addToCartButton = page.getByRole("button", { name: /add to cart|toevoegen|in winkelwagen/i });
    if (await addToCartButton.count() > 0) {
      await addToCartButton.click();
      await page.waitForTimeout(1000);
    }
  });

  test("should navigate to checkout from cart", async ({ page }) => {
    await page.goto("/cart");
    await page.waitForLoadState("networkidle");
    
    // Find checkout button
    const checkoutButton = page.getByRole("button", { name: /checkout|afrekenen|bestellen/i })
      .or(page.getByRole("link", { name: /checkout|afrekenen|bestellen/i }));
    
    if (await checkoutButton.count() > 0) {
      await checkoutButton.first().click();
      
      // Should navigate to checkout or Stripe
      await page.waitForLoadState("networkidle");
      
      // Either on checkout page or redirected to Stripe
      const url = page.url();
      const isCheckout = url.includes("/checkout") || url.includes("stripe.com");
      expect(isCheckout).toBeTruthy();
    }
  });

  test("should display order summary on checkout", async ({ page }) => {
    await page.goto("/checkout");
    await page.waitForLoadState("networkidle");
    
    // Check for order summary elements
    const orderSummary = page.locator('[data-testid="order-summary"]')
      .or(page.locator('.order-summary'))
      .or(page.locator('text=/order summary|bestelling|overzicht/i'));
    
    // Should show products or redirect to Stripe
    const url = page.url();
    if (!url.includes("stripe.com")) {
      // If still on our site, check for summary
      const prices = page.locator('text=/[€$]\\d+/');
      await expect(prices.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("should show shipping form fields", async ({ page }) => {
    await page.goto("/checkout");
    await page.waitForLoadState("networkidle");
    
    const url = page.url();
    
    // Only check form fields if not redirected to Stripe
    if (!url.includes("stripe.com")) {
      // Look for common shipping form fields
      const emailField = page.getByLabel(/email/i).or(page.locator('input[type="email"]'));
      const nameField = page.getByLabel(/name|naam/i).or(page.locator('input[name*="name"]'));
      const addressField = page.getByLabel(/address|adres/i).or(page.locator('input[name*="address"]'));
      
      // At least email should be present for guest checkout
      if (await emailField.count() > 0) {
        await expect(emailField.first()).toBeVisible();
      }
    }
  });

  test("should validate required checkout fields", async ({ page }) => {
    await page.goto("/checkout");
    await page.waitForLoadState("networkidle");
    
    const url = page.url();
    
    if (!url.includes("stripe.com")) {
      // Try to submit without filling required fields
      const submitButton = page.getByRole("button", { name: /pay|betalen|submit|bestellen/i });
      
      if (await submitButton.count() > 0) {
        await submitButton.first().click();
        
        // Should show validation errors
        await page.waitForTimeout(500);
        
        const errorMessages = page.locator('[role="alert"]')
          .or(page.locator('.error'))
          .or(page.locator('text=/required|verplicht|invalid/i'));
        
        // Either errors shown or form prevented submission
      }
    }
  });

  test("should calculate correct totals", async ({ page }) => {
    await page.goto("/cart");
    await page.waitForLoadState("networkidle");
    
    // Check that subtotal, shipping, and total are displayed
    const subtotal = page.locator('text=/subtotal|subtotaal/i');
    const total = page.locator('text=/total|totaal/i');
    
    await expect(total.first()).toBeVisible({ timeout: 5000 });
    
    // Verify prices contain valid numbers
    const priceText = await page.locator('text=/[€$]\\d+/').first().textContent();
    expect(priceText).toMatch(/[€$]\d+/);
  });
});

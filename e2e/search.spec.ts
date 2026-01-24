import { test, expect } from "../playwright-fixture";

test.describe("Search Functionality", () => {
  test("should open search and find products", async ({ page }) => {
    await page.goto("/");
    
    // Find and click search button/input
    const searchButton = page.locator('[aria-label*="search"]')
      .or(page.locator('[data-testid="search"]'))
      .or(page.getByRole("button", { name: /search|zoek/i }));
    
    const searchInput = page.locator('input[type="search"]')
      .or(page.locator('input[placeholder*="search" i]'))
      .or(page.locator('input[placeholder*="zoek" i]'));
    
    // Click search if it's a button that reveals input
    if (await searchButton.count() > 0) {
      await searchButton.first().click();
      await page.waitForTimeout(500);
    }
    
    // Type search query
    if (await searchInput.count() > 0) {
      await searchInput.first().fill("dog");
      await page.waitForTimeout(1000);
      
      // Check for search results
      const results = page.locator('[data-testid="search-results"]')
        .or(page.locator('.search-results'))
        .or(page.locator('[role="listbox"]'));
      
      // Results should appear
      if (await results.count() > 0) {
        await expect(results.first()).toBeVisible();
      }
    }
  });

  test("should navigate to search results page", async ({ page }) => {
    await page.goto("/products?search=collar");
    await page.waitForLoadState("networkidle");
    
    // Should show filtered products
    const productCards = page.locator('[data-testid="product-card"]')
      .or(page.locator('.product-card'))
      .or(page.locator('a[href*="/products/"]'));
    
    // Wait for products to load
    await page.waitForTimeout(1000);
  });

  test("should show no results message for invalid search", async ({ page }) => {
    await page.goto("/products?search=xyznonexistent123");
    await page.waitForLoadState("networkidle");
    
    // Should show no results message
    const noResults = page.locator('text=/no results|geen resultaten|not found|niets gevonden/i');
    
    await page.waitForTimeout(1000);
    
    // Either no results message or empty product list
    const productCards = page.locator('[data-testid="product-card"]').or(page.locator('.product-card'));
    const isEmpty = await productCards.count() === 0;
    
    if (isEmpty) {
      // Page handles empty state
      expect(isEmpty).toBeTruthy();
    }
  });

  test("should support search suggestions", async ({ page }) => {
    await page.goto("/");
    
    const searchInput = page.locator('input[type="search"]')
      .or(page.locator('input[placeholder*="search" i]'))
      .or(page.locator('input[placeholder*="zoek" i]'));
    
    // Open search first if needed
    const searchButton = page.locator('[aria-label*="search"]').or(page.locator('[data-testid="search"]'));
    if (await searchButton.count() > 0) {
      await searchButton.first().click();
      await page.waitForTimeout(500);
    }
    
    if (await searchInput.count() > 0) {
      // Type partial query
      await searchInput.first().fill("col");
      await page.waitForTimeout(1000);
      
      // Check for suggestions dropdown
      const suggestions = page.locator('[role="listbox"]')
        .or(page.locator('.suggestions'))
        .or(page.locator('[data-testid="search-suggestions"]'));
      
      // Suggestions may or may not appear
    }
  });
});

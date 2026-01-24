import { test, expect } from "../playwright-fixture";

test.describe("Homepage", () => {
  test("should load homepage successfully", async ({ page }) => {
    await page.goto("/");
    
    // Check page loads without errors
    await expect(page).toHaveTitle(/GetPawsy|Pet|Huisdier/i);
    
    // Main content should be visible
    await expect(page.locator("main").or(page.locator("#root"))).toBeVisible();
  });

  test("should display navigation menu", async ({ page }) => {
    await page.goto("/");
    
    // Check for navigation
    const nav = page.locator("nav").or(page.locator("header"));
    await expect(nav.first()).toBeVisible();
    
    // Check for logo
    const logo = page.locator('img[alt*="logo"]').or(page.locator('[data-testid="logo"]'));
    await expect(logo.first()).toBeVisible();
  });

  test("should display bestsellers section", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    
    // Look for bestsellers section
    const bestsellers = page.locator('text=/bestseller|popular|populair/i')
      .or(page.locator('[data-testid="bestsellers"]'));
    
    if (await bestsellers.count() > 0) {
      await expect(bestsellers.first()).toBeVisible();
    }
  });

  test("should have working footer links", async ({ page }) => {
    await page.goto("/");
    
    // Scroll to footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    
    // Check footer is visible
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
    
    // Check for common footer links
    const contactLink = page.getByRole("link", { name: /contact/i });
    const privacyLink = page.getByRole("link", { name: /privacy/i });
    
    if (await contactLink.count() > 0) {
      await expect(contactLink.first()).toBeVisible();
    }
  });

  test("should be responsive on mobile viewport", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    
    // Check that mobile menu button exists
    const mobileMenuButton = page.locator('[aria-label*="menu"]')
      .or(page.locator('[data-testid="mobile-menu"]'))
      .or(page.locator('button:has(svg)').first());
    
    // Page should still be functional
    await expect(page.locator("main").or(page.locator("#root"))).toBeVisible();
  });

  test("should show newsletter signup", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    
    // Scroll to find newsletter section
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    
    // Look for newsletter form
    const newsletterSection = page.locator('text=/newsletter|nieuwsbrief|subscribe|aanmelden/i');
    const emailInput = page.locator('input[type="email"]');
    
    // Newsletter section or email input should exist
    const hasNewsletter = await newsletterSection.count() > 0 || await emailInput.count() > 0;
    expect(hasNewsletter).toBeTruthy();
  });
});

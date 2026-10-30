import { test, expect } from "../playwright-fixture";

test.describe("Visual Regression Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('gp_dev_geo_panel_open', '0');
    });
    await page.addStyleTag({
      content: '[aria-label="Open dev consent panel"], [aria-label="Dev consent simulator"] { display: none !important; }',
    });
  });
  test.describe("Homepage", () => {
    test("homepage desktop", async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      
      // Wait for images to load
      await page.waitForTimeout(2000);
      
      await expect(page).toHaveScreenshot("homepage-desktop.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });

    test("homepage tablet", async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      
      await expect(page).toHaveScreenshot("homepage-tablet.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });

    test("homepage mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      
      await expect(page).toHaveScreenshot("homepage-mobile.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Products Page", () => {
    test("products grid desktop", async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto("/products");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      
      await expect(page).toHaveScreenshot("products-grid-desktop.png", {
        maxDiffPixelRatio: 0.05,
      });
    });

    test("products grid mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("/products");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      
      await expect(page).toHaveScreenshot("products-grid-mobile.png", {
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Product Detail Page", () => {
    test("product detail desktop", async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto("/products");
      await page.waitForLoadState("networkidle");
      
      // Navigate to first product
      await page.locator('a[href*="/products/"]').first().click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      
      await expect(page).toHaveScreenshot("product-detail-desktop.png", {
        maxDiffPixelRatio: 0.05,
      });
    });

    test("product detail mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("/products");
      await page.waitForLoadState("networkidle");
      
      await page.locator('a[href*="/products/"]').first().click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);
      
      await expect(page).toHaveScreenshot("product-detail-mobile.png", {
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Cart Page", () => {
    test("empty cart", async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto("/cart");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      
      await expect(page).toHaveScreenshot("cart-empty-desktop.png", {
        maxDiffPixelRatio: 0.05,
      });
    });

    test("cart with items", async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      
      // Add a product first
      await page.goto("/products");
      await page.waitForLoadState("networkidle");
      await page.locator('a[href*="/products/"]').first().click();
      await page.waitForLoadState("networkidle");
      
      const addToCartButton = page.locator("#pdp-buy-box").getByRole("button", { name: /add to cart|toevoegen|in winkelwagen/i }).first();
      await expect(addToCartButton).toBeVisible();
      await addToCartButton.click();
      await expect(page.getByText(/added to (your )?cart/i).first()).toBeVisible();
      
      await page.goto("/cart");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      
      await expect(page).toHaveScreenshot("cart-with-items-desktop.png", {
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Navigation Components", () => {
    test("navbar desktop", async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      
      const navbar = page.locator("header").or(page.locator("nav")).first();
      await expect(navbar).toHaveScreenshot("navbar-desktop.png", {
        maxDiffPixelRatio: 0.05,
      });
    });

    test("navbar mobile", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      
      const navbar = page.locator("header").or(page.locator("nav")).first();
      await expect(navbar).toHaveScreenshot("navbar-mobile.png", {
        maxDiffPixelRatio: 0.05,
      });
    });

    test("mobile menu open", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      
      // Open mobile menu
      const menuButton = page.getByRole('button', { name: 'Open menu', exact: true });
      await expect(menuButton).toBeVisible();
      await menuButton.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page).toHaveScreenshot("mobile-menu-open.png", {
        maxDiffPixelRatio: 0.05,
      });
    });

    test("footer", async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      
      const footer = page.locator("footer");
      await footer.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      
      await expect(footer).toHaveScreenshot("footer-desktop.png", {
        maxDiffPixelRatio: 0.05,
      });
    });
  });

  test.describe("Static Pages", () => {
    test("about page", async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto("/about");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      
      await expect(page).toHaveScreenshot("about-page-desktop.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });

    test("contact page", async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto("/contact");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      
      await expect(page).toHaveScreenshot("contact-page-desktop.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });

    test("faq page", async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto("/faq");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
      
      await expect(page).toHaveScreenshot("faq-page-desktop.png", {
        fullPage: true,
        maxDiffPixelRatio: 0.05,
      });
    });
  });
});

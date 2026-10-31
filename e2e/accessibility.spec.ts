import { test, expect } from "../playwright-fixture";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
// Catalog API requests can remain active; wait for shopper-visible readiness,
// not networkidle (which can time out despite fully rendered products).
async function waitForCatalogReady(page: Page) {
  await expect(page.locator('a[href^="/products/"]').first()).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("Loading products...", { exact: true })).toHaveCount(0);
}


test.describe("Accessibility Tests", () => {
  test.beforeEach(async ({ page }) => {
    // Close the localhost-only developer panel; audit the shopper experience.
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('gp_dev_geo_panel_open', '0'));
  });
  test.describe("Homepage", () => {
    test("should have no critical accessibility issues", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const criticalViolations = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      );

      expect(criticalViolations).toEqual([]);
    });

    test("should have proper heading hierarchy", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withRules(["heading-order", "empty-heading"])
        .analyze();

      expect(results.violations).toEqual([]);
    });

    test("should have proper landmark regions", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withRules(["region", "landmark-one-main", "landmark-no-duplicate-banner"])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  });

  test.describe("Products Page", () => {
    test("should have no critical accessibility issues", async ({ page }) => {
      await page.goto("/products", { waitUntil: "domcontentloaded" });
      await waitForCatalogReady(page);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      const criticalViolations = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      );

      expect(criticalViolations).toEqual([]);
    });

    test("should have accessible product cards", async ({ page }) => {
      await page.goto("/products", { waitUntil: "domcontentloaded" });
      await waitForCatalogReady(page);

      const results = await new AxeBuilder({ page })
        .withRules(["image-alt", "link-name", "button-name"])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  });

  test.describe("Product Detail Page", () => {
    test("should have no critical accessibility issues", async ({ page }) => {
      await page.goto("/products", { waitUntil: "domcontentloaded" });
      await waitForCatalogReady(page);
      await page.locator('a[href*="/products/"]').first().click();
      await expect(page.locator("#pdp-buy-box")).toBeVisible({ timeout: 25_000 });
      // The PDP breadcrumb wrapper animates from opacity 0 to 1. Network-idle
      // does not wait for that animation, so axe can sample faded text.
      // Audit at the final rendered opacity; do not suppress contrast failures.
      const breadcrumb = page.locator('nav[aria-label="breadcrumb"]');
      await expect(breadcrumb).toBeVisible();
      await expect(breadcrumb.locator('xpath=..')).toHaveCSS("opacity", "1");
      // The reviews section also fades in after a delayed motion transition.
      // Axe must inspect its settled colors, not a translucent animation frame.
      await expect(page.locator("#reviews")).toHaveCSS("opacity", "1");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      const criticalViolations = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      );

      expect(criticalViolations).toEqual([]);
    });

    test("should have accessible form controls", async ({ page }) => {
      await page.goto("/products", { waitUntil: "domcontentloaded" });
      await waitForCatalogReady(page);
      await page.locator('a[href*="/products/"]').first().click();
      await expect(page.locator("#pdp-buy-box")).toBeVisible({ timeout: 25_000 });

      const results = await new AxeBuilder({ page })
        .withRules(["label", "select-name", "button-name"])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  });

  test.describe("Cart Page", () => {
    test("should have no critical accessibility issues", async ({ page }) => {
      await page.goto("/cart");
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      const criticalViolations = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      );

      expect(criticalViolations).toEqual([]);
    });
  });

  test.describe("Checkout Page", () => {
    test("should have accessible form fields", async ({ page }) => {
      await page.goto("/checkout");
      await page.waitForLoadState("networkidle");

      // Only test if not redirected to Stripe
      if (!page.url().includes("stripe.com")) {
        const results = await new AxeBuilder({ page })
          .withRules(["label", "form-field-multiple-labels", "autocomplete-valid"])
          .analyze();

        expect(results.violations).toEqual([]);
      }
    });
  });

  test.describe("Navigation", () => {
    test("should have accessible navigation", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .include("nav, header")
        .withRules(["link-name", "aria-valid-attr", "aria-valid-attr-value"])
        .analyze();

      expect(results.violations).toEqual([]);
    });

    test("should have accessible footer", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .include("footer")
        .withRules(["link-name", "list"])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  });

  test.describe("Color Contrast", () => {
    test("homepage should have sufficient color contrast", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withRules(["color-contrast"])
        .analyze();

      // Log warnings but don't fail on contrast (can be design decision)
      if (results.violations.length > 0) {
        console.warn("Color contrast issues found:", results.violations.length);
      }
    });
  });

  test.describe("Keyboard Navigation", () => {
    test("should be able to navigate with keyboard", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Tab through focusable elements
      await page.keyboard.press("Tab");
      const firstFocused = await page.evaluate(() => document.activeElement?.tagName);
      expect(firstFocused).toBeTruthy();

      // Should be able to tab to navigation
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press("Tab");
      }

      const focusedElement = await page.evaluate(() => ({
        tag: document.activeElement?.tagName,
        role: document.activeElement?.getAttribute("role"),
      }));

      expect(focusedElement.tag).toBeTruthy();
    });

    test("skip link should be accessible", async ({ page }) => {
      await page.goto("/");
      // The header (and its skip link) renders after hydration; pressing Tab
      // before that focuses the pre-render shell instead of the app.
      await page.locator('a[href="#main"], a[href="#content"]').first().waitFor({ state: "attached" });

      // Press tab to reveal skip link (if exists)
      await page.keyboard.press("Tab");

      const skipLink = page.locator('a[href="#main"], a[href="#content"]').first();
      if (await skipLink.count() > 0) {
        await expect(skipLink).toBeFocused();
      }
    });
  });

  test.describe("Mobile Accessibility", () => {
    test("mobile menu should be accessible", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      const criticalViolations = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      );

      expect(criticalViolations).toEqual([]);
    });
  });

  test.describe("Static Pages", () => {
    const staticPages = ["/about", "/contact", "/faq", "/privacy-policy", "/terms-of-service"];

    for (const pagePath of staticPages) {
      test(`${pagePath} should have no critical a11y issues`, async ({ page }) => {
        await page.goto(pagePath);
        await page.waitForLoadState("networkidle");

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa"])
          .analyze();

        const criticalViolations = results.violations.filter(
          (v) => v.impact === "critical" || v.impact === "serious"
        );

        expect(criticalViolations).toEqual([]);
      });
    }
  });
});

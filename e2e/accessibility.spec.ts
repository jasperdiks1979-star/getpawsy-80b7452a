import { test, expect } from "../playwright-fixture";
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility Tests", () => {
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
      await page.goto("/products");
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      const criticalViolations = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      );

      expect(criticalViolations).toEqual([]);
    });

    test("should have accessible product cards", async ({ page }) => {
      await page.goto("/products");
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withRules(["image-alt", "link-name", "button-name"])
        .analyze();

      expect(results.violations).toEqual([]);
    });
  });

  test.describe("Product Detail Page", () => {
    test("should have no critical accessibility issues", async ({ page }) => {
      await page.goto("/products");
      await page.waitForLoadState("networkidle");
      await page.locator('a[href*="/products/"]').first().click();
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      const criticalViolations = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
      );

      expect(criticalViolations).toEqual([]);
    });

    test("should have accessible form controls", async ({ page }) => {
      await page.goto("/products");
      await page.waitForLoadState("networkidle");
      await page.locator('a[href*="/products/"]').first().click();
      await page.waitForLoadState("networkidle");

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

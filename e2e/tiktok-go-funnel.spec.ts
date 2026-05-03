import { test, expect, devices } from "@playwright/test";

/**
 * /go TikTok funnel smoke tests — mobile Safari (iPhone 13).
 *
 * Verifies the live ad path stays intact:
 *   1. /go loads with the spec hook headline.
 *   2. Tapping the primary CTA navigates to the exact product URL.
 *   3. UTM parameters (utm_source / utm_medium / utm_campaign /
 *      utm_content / ad) are preserved through the navigation.
 *
 * SAFETY: Read-only — never adds to cart, never starts checkout.
 */

const AD_URL =
  "/go?ad=tt&utm_source=tiktok&utm_medium=social&utm_campaign=hook1&utm_content=tt_bio_link";
const PRODUCT_SLUG = "automatic-cat-litter-box-self-cleaning-app-control";

test.use({ ...devices["iPhone 13"] });

test.describe("/go TikTok funnel — mobile Safari", () => {
  test("loads /go with hook headline", async ({ page }) => {
    await page.goto(AD_URL);
    await expect(page.locator("h1")).toContainText(/scoop/i);
    await expect(page.locator("main")).toBeVisible();
  });

  test("primary CTA navigates to canonical product URL with UTMs preserved", async ({ page }) => {
    await page.goto(AD_URL);

    // The primary CTA wrapper has data-cta-placement="bio_primary"; click
    // the visible button inside it.
    const primaryCta = page
      .locator('[data-cta-placement="bio_primary"]')
      .getByRole("link")
      .first()
      .or(page.getByRole("link", { name: /how it works|get yours|shop|claim|see/i }).first());

    await expect(primaryCta).toBeVisible();
    await primaryCta.click();

    await page.waitForURL(new RegExp(`/products/${PRODUCT_SLUG}`));

    const url = new URL(page.url());
    expect(url.pathname).toBe(`/products/${PRODUCT_SLUG}`);
    expect(url.searchParams.get("utm_source")).toBe("tiktok");
    expect(url.searchParams.get("utm_medium")).toBe("social");
    expect(url.searchParams.get("utm_campaign")).toBe("hook1");
    expect(url.searchParams.get("utm_content")).toBe("tt_bio_link");
    expect(url.searchParams.get("ad")).toBe("tt");
  });

  test("legacy /product/ singular route preserves UTMs to canonical /products/", async ({ page }) => {
    await page.goto(
      `/product/${PRODUCT_SLUG}?ad=tt&utm_source=tiktok&utm_medium=social&utm_campaign=hook1&utm_content=tt_bio_link`,
    );
    await page.waitForURL(new RegExp(`/products/${PRODUCT_SLUG}`));
    const url = new URL(page.url());
    expect(url.pathname).toBe(`/products/${PRODUCT_SLUG}`);
    expect(url.searchParams.get("utm_source")).toBe("tiktok");
    expect(url.searchParams.get("utm_campaign")).toBe("hook1");
    expect(url.searchParams.get("utm_content")).toBe("tt_bio_link");
    expect(url.searchParams.get("ad")).toBe("tt");
  });
});
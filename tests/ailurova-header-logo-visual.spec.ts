/**
 * Ailurova header logo & favicon — pixel-diff visual regression.
 *
 * Complements `ailurova-header-logo.spec.ts` (which asserts geometry/CLS).
 * This spec captures pixel snapshots of:
 *   1. The header logo element on desktop / tablet / mobile
 *   2. The favicon <link rel="icon"> asset (fetched + rendered at 32×32)
 *
 * Playwright's `toHaveScreenshot()` produces `.png` baselines under
 * `tests/ailurova-header-logo-visual.spec.ts-snapshots/`. First run creates
 * baselines; subsequent runs fail on any drift beyond the tolerance.
 *
 * Tolerance is intentionally tight (maxDiffPixelRatio: 0.01, threshold: 0.2)
 * so anti-alias noise passes but genuine visual drift — wrong asset, wrong
 * dimensions, colour shift, wordmark reappearing — is caught.
 *
 * Update baselines intentionally with:
 *   npx playwright test tests/ailurova-header-logo-visual.spec.ts --update-snapshots
 *
 * Run: npx playwright test tests/ailurova-header-logo-visual.spec.ts
 */
import { test, expect, Page } from "@playwright/test";

const URL = process.env.AILUROVA_URL || "https://ailurova.com/";

const LOGO_SEL =
  ".header__heading-logo-link, .header__heading-logo, a[href='/'] .header__heading-logo, .header a[href='/']";

const BREAKPOINTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 },
];

// Tight but AA-tolerant diff config
const DIFF_OPTS = {
  maxDiffPixelRatio: 0.01, // ≤1% of pixels may differ
  threshold: 0.2,          // per-pixel colour tolerance (0-1)
  animations: "disabled" as const,
  caret: "hide" as const,
};

async function stabilize(page: Page) {
  // Disable transitions/animations so screenshots are deterministic.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
  // Give web fonts/background-images a beat to paint.
  await page.evaluate(() => (document as any).fonts?.ready);
  await page.waitForTimeout(400);
}

for (const bp of BREAKPOINTS) {
  test(`Header logo pixel-diff — ${bp.name} (${bp.width}x${bp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await page.goto(URL, { waitUntil: "networkidle" });
    await stabilize(page);

    const logo = page.locator(LOGO_SEL).first();
    await logo.waitFor({ state: "visible", timeout: 10_000 });

    // Sanity: painted background must be our SVG (guards against a wrong-asset baseline).
    const bg = await logo.evaluate(
      (el) => getComputedStyle(el as Element).backgroundImage
    );
    expect(bg, "logo background-image missing before snapshot").toMatch(
      /ailurova-logo(-light)?\.svg/
    );

    // Element-scoped snapshot — isolates the logo from surrounding chrome.
    await expect(logo).toHaveScreenshot(`header-logo-${bp.name}.png`, DIFF_OPTS);
  });
}

test("Favicon pixel-diff (32×32)", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(URL, { waitUntil: "domcontentloaded" });

  // Resolve the highest-priority favicon link in the document.
  const iconHref = await page.evaluate(() => {
    const rels = ["icon", "shortcut icon", "apple-touch-icon"];
    for (const rel of rels) {
      const el = document.querySelector(
        `link[rel="${rel}"]`
      ) as HTMLLinkElement | null;
      if (el?.href) return el.href;
    }
    return null;
  });
  expect(iconHref, "no favicon <link> found in document head").toBeTruthy();

  // Fetch the asset directly so we snapshot the SOURCE bitmap, not a browser-scaled tab icon.
  const res = await request.get(iconHref!);
  expect(res.status(), `favicon fetch failed for ${iconHref}`).toBe(200);
  const buf = await res.body();
  const b64 = buf.toString("base64");
  const ct = res.headers()["content-type"] || "image/png";

  // Render at 32×32 on a neutral background so anti-alias against transparency is deterministic.
  await page.setContent(`
    <!doctype html>
    <html><head><style>
      html,body{margin:0;padding:0;background:#ffffff;}
      .stage{width:64px;height:64px;display:flex;align-items:center;justify-content:center;
             background:#f5f5f4;border:1px solid #e7e5e4;}
      img{width:32px;height:32px;image-rendering:auto;display:block;}
    </style></head>
    <body><div class="stage"><img id="fav" src="data:${ct};base64,${b64}" alt="favicon"/></div></body>
    </html>
  `);
  const img = page.locator("#fav");
  await img.waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const el = document.getElementById("fav") as HTMLImageElement | null;
    return !!el && el.complete && el.naturalWidth > 0;
  });
  await page.waitForTimeout(150);

  await expect(page.locator(".stage")).toHaveScreenshot("favicon-32.png", DIFF_OPTS);
});
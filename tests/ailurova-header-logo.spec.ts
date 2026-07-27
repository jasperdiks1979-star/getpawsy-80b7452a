/**
 * Ailurova header logo — visual & CLS integrity check.
 *
 * Verifies across desktop / tablet / mobile breakpoints:
 *  1. The SVG logo is present and visible (background-image painted).
 *  2. The logo is vertically centered within the header (±2px tolerance).
 *  3. The logo does not overlap the primary nav or cart/account icons.
 *  4. The logo/wordmark does not wrap onto a second line (single-row height).
 *  5. Cumulative Layout Shift on the homepage stays below 0.10 after load.
 *
 * Run: npx playwright test tests/ailurova-header-logo.spec.ts
 */
import { test, expect, Page } from "@playwright/test";

const URL = process.env.AILUROVA_URL || "https://ailurova.com/";
const CLS_HARD = 0.10;

const BREAKPOINTS = [
  { name: "desktop-xl", width: 1920, height: 1080 },
  { name: "desktop",    width: 1440, height: 900  },
  { name: "laptop",     width: 1280, height: 800  },
  { name: "tablet",     width: 834,  height: 1112 },
  { name: "mobile-l",   width: 414,  height: 896  },
  { name: "mobile",     width: 390,  height: 844  },
  { name: "mobile-s",   width: 360,  height: 780  },
];

// Selector for our injected logo target (native Horizon _header-logo link).
// The CSS injection paints ailurova-logo.svg as background-image on the
// `.header__heading-logo` (or link) element inside `.header`.
const HEADER_SEL   = "header, .header, .header-wrapper header";
const LOGO_SEL     = ".header__heading-logo-link, .header__heading-logo, a[href='/'] .header__heading-logo, .header a[href='/']";
const NAV_SEL      = ".header__inline-menu, nav.header__inline-menu, .header nav";
const ICONS_SEL    = ".header__icons, .header-actions, .header__icon-list";

async function measureCLS(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let cls = 0;
        try {
          const po = new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as any[]) {
              if (!entry.hadRecentInput) cls += entry.value;
            }
          });
          po.observe({ type: "layout-shift", buffered: true });
          setTimeout(() => {
            try { po.disconnect(); } catch {}
            resolve(cls);
          }, 3000);
        } catch {
          resolve(0);
        }
      })
  );
}

async function firstVisibleBox(page: Page, selector: string) {
  const loc = page.locator(selector).first();
  if ((await loc.count()) === 0) return null;
  try {
    await loc.waitFor({ state: "visible", timeout: 5000 });
  } catch {
    return null;
  }
  return await loc.boundingBox();
}

function rectsOverlap(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

for (const bp of BREAKPOINTS) {
  test(`Ailurova header logo — ${bp.name} (${bp.width}x${bp.height})`, async ({ page, context }) => {
    await page.setViewportSize({ width: bp.width, height: bp.height });

    // Throttle to a realistic 4G-ish profile so CLS is measured under load.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: (4 * 1024 * 1024) / 8,
      uploadThroughput:   (1 * 1024 * 1024) / 8,
      latency: 80,
    });

    await page.goto(URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // 1. Header + logo present
    const headerBox = await firstVisibleBox(page, HEADER_SEL);
    expect(headerBox, "header not visible").not.toBeNull();

    const logoBox = await firstVisibleBox(page, LOGO_SEL);
    expect(logoBox, "logo element not visible").not.toBeNull();

    // 2. Painted background-image is our SVG
    const bg = await page.locator(LOGO_SEL).first().evaluate(
      (el) => getComputedStyle(el as Element).backgroundImage
    );
    expect(bg, "logo background-image missing").toMatch(/ailurova-logo(-light)?\.svg/);

    // 3. Logo vertically centered in header (±2px)
    const h = headerBox!;
    const l = logoBox!;
    const headerMidY = h.y + h.height / 2;
    const logoMidY   = l.y + l.height / 2;
    const dy = Math.abs(headerMidY - logoMidY);
    expect(dy, `logo not vertically centered (Δy=${dy.toFixed(1)}px)`).toBeLessThanOrEqual(2);

    // 4. Logo not wrapping — height must match a single row.
    // Expected painted heights: desktop ≈32px, mobile ≈28px. Guard against 2× wrap.
    const maxSingleRow = bp.width >= 900 ? 44 : 40;
    expect(l.height, `logo appears wrapped (h=${l.height}px)`).toBeLessThanOrEqual(maxSingleRow);

    // 5. Logo must not overlap the nav or the header icon cluster
    for (const [label, sel] of [["nav", NAV_SEL], ["icons", ICONS_SEL]] as const) {
      const box = await firstVisibleBox(page, sel);
      if (box) {
        expect(
          rectsOverlap(l, box),
          `logo overlaps ${label} at ${bp.name}`
        ).toBe(false);
      }
    }

    // 6. CLS budget
    const cls = await measureCLS(page);
    console.log(`[${bp.name}] CLS=${cls.toFixed(4)}  logo=${Math.round(l.width)}×${Math.round(l.height)}  Δy=${dy.toFixed(1)}`);
    expect(cls, `CLS ${cls.toFixed(4)} exceeds ${CLS_HARD}`).toBeLessThan(CLS_HARD);
  });
}
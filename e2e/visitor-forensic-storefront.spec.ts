import { test, expect } from "../playwright-fixture";

/**
 * P0 Visitor-perspective forensic regression suite.
 *
 * Codifies the 2026-07-06 forensic: no anonymous storefront path may
 * regress into a crash, a wiped attribution key, or a dead ATC button.
 *
 * Runs against the running dev preview (baseURL http://localhost:8080)
 * with a clean anonymous browser context — no login, no cookies, no admin.
 *
 * If this suite fails, the storefront is broken for real visitors — do NOT
 * merge, do NOT deploy.
 */

const FOOTER_PATHS = [
  "/",
  "/products",
  "/cart",
  "/checkout",
  "/contact",
  "/shipping",
  "/returns",
  "/faq",
  "/track-order",
  "/about",
  "/privacy",
  "/terms",
  "/collections/dog",
  "/collections/cat",
];

const ATTRIBUTION_KEYS = [
  "gp_visitor_id",
  "first_seen_at",
  "first_utm_source",
  "gp_cookie_consent",
  "gp_utm_source",
  "__lovable_anonymous_id",
] as const;

const LEGACY_CART_STATES: Array<[string, string]> = [
  ["legacy-object", '{"items":[{"id":"old","name":"Legacy","price":9.99,"quantity":1}]}'],
  ["legacy-corrupted", "corrupted-garbage-not-json"],
  ["legacy-empty-array", "[]"],
];

const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc";

test.describe("Visitor-perspective storefront forensic", () => {
  test("all core + footer routes render without crashing", async ({ page }) => {
    for (const path of FOOTER_PATHS) {
      const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(resp?.status(), `status for ${path}`).toBeLessThan(400);
      const body = (await page.locator("body").innerText()).toLowerCase();
      expect(body, `crash on ${path}`).not.toContain("something went wrong");
    }
  });

  for (const [label, value] of LEGACY_CART_STATES) {
    test(`legacy pawsy-cart (${label}) never crashes the storefront`, async ({ page }) => {
      await page.goto("/robots.txt", { waitUntil: "domcontentloaded" });
      await page.evaluate((v) => localStorage.setItem("pawsy-cart", v), value);

      for (const path of ["/", "/products", "/cart"]) {
        await page.goto(path, { waitUntil: "domcontentloaded" });
        const body = (await page.locator("body").innerText()).toLowerCase();
        expect(body, `crash on ${path} with ${label}`).not.toContain("something went wrong");
      }
    });
  }

  test("DataHealer preserves attribution & consent keys across reload + navigation", async ({ page }) => {
    await page.goto("/robots.txt", { waitUntil: "domcontentloaded" });
    await page.evaluate((keys) => {
      const seed: Record<string, string> = {
        gp_visitor_id: "test-visitor-uuid-1234",
        first_seen_at: "2026-07-01T00:00:00.000Z",
        first_utm_source: "pinterest",
        gp_cookie_consent: "granted",
        gp_utm_source: "pinterest",
        __lovable_anonymous_id: "anon-1234",
      };
      for (const k of keys) localStorage.setItem(k, seed[k]);
    }, [...ATTRIBUTION_KEYS]);

    await page.goto("/?utm_source=pinterest&utm_medium=social", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.goto("/cart", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);

    const survivors = await page.evaluate(
      (keys) => Object.fromEntries(keys.map((k) => [k, localStorage.getItem(k)])),
      [...ATTRIBUTION_KEYS],
    );
    for (const k of ATTRIBUTION_KEYS) {
      expect(survivors[k], `attribution key '${k}' was wiped by DataHealer`).not.toBeNull();
    }
  });

  test("anonymous visitor can PDP → ATC → cart with a live product", async ({ page }) => {
    const res = await page.request.get(
      "https://nojvgfbcjgipjxpfatmm.supabase.co/rest/v1/products_public?select=slug,stock&limit=25",
      { headers: { apikey: ANON_KEY } },
    );
    expect(res.ok(), "products_public must be readable by anon").toBeTruthy();
    const rows = (await res.json()) as Array<{ slug: string; stock: number }>;
    const target = rows.find((r) => (r.stock ?? 0) > 0) ?? rows[0];
    expect(target?.slug, "must have at least one live product").toBeTruthy();

    await page.goto(`/products/${target.slug}?utm_source=pinterest`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body, "PDP must not show error boundary").not.toContain("something went wrong");
    expect(body, "PDP must not be a 404").not.toContain("page not found");

    const atcButtons = page.getByRole("button", { name: /add to (cart|bag)/i });
    const count = await atcButtons.count();
    expect(count, "at least one ATC button on PDP").toBeGreaterThan(0);

    let clicked = false;
    for (let i = 0; i < count; i++) {
      const b = atcButtons.nth(i);
      if ((await b.isVisible()) && (await b.isEnabled())) {
        await b.scrollIntoViewIfNeeded();
        await b.click({ timeout: 5000 });
        clicked = true;
        break;
      }
    }
    expect(clicked, "must find a clickable ATC button").toBeTruthy();
    await page.waitForTimeout(1200);

    const cart = await page.evaluate(() => localStorage.getItem("pawsy-cart"));
    expect(cart, "pawsy-cart must be populated after ATC").toBeTruthy();
    let parsedLen = 0;
    try {
      const parsed = JSON.parse(cart ?? "[]");
      parsedLen = Array.isArray(parsed) ? parsed.length : (parsed.items?.length ?? 0);
    } catch {
      parsedLen = -1;
    }
    expect(parsedLen, "pawsy-cart must contain at least 1 item").toBeGreaterThan(0);

    await page.goto("/cart", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    const cartBody = (await page.locator("body").innerText()).toLowerCase();
    expect(cartBody, "cart must not show empty state after ATC").not.toContain("your cart is empty");
    expect(cartBody, "cart must not crash").not.toContain("something went wrong");
  });
});

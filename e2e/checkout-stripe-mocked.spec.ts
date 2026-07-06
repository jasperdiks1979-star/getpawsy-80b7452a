import { test, expect } from "../playwright-fixture";

/**
 * E2E — Stripe checkout session creation (anonymous, PII-free via mock).
 *
 * Goal: prove the storefront can create a Stripe checkout session and redirect
 * to it, WITHOUT hitting the real create-checkout edge function and WITHOUT
 * requiring real payment PII. We intercept the network call and assert:
 *   1. The payload is well-formed (items, email, currency-safe shape).
 *   2. The app consumes { url } and attempts navigation to Stripe.
 *   3. The Stripe URL is never actually opened (network aborted).
 *
 * If this test fails, the anonymous checkout invocation is broken — do NOT
 * deploy.
 */

const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vanZnZmJjamdpcGp4cGZhdG1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MTMxOTYsImV4cCI6MjA4Mzk4OTE5Nn0.gfjmYf9aB-BCIrCnH14Zmnm6GBEKX7QMWP1ELL_i9dc";

const MOCK_STRIPE_URL =
  "https://checkout.stripe.com/c/pay/cs_test_mock_forensic_e2e_session_id_never_real";

test("anonymous visitor triggers a valid create-checkout invocation and consumes the returned Stripe URL", async ({
  page,
}) => {
  const consoleLines: string[] = [];
  page.on("console", (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => consoleLines.push(`[pageerror] ${err.message}`));
  // 1. Fetch a live in-stock product so the cart payload is realistic.
  const productsRes = await page.request.get(
    "https://nojvgfbcjgipjxpfatmm.supabase.co/rest/v1/products_public?select=id,slug,name,price,image_url,stock&limit=25",
    { headers: { apikey: ANON_KEY } },
  );
  expect(productsRes.ok(), "products_public must be readable by anon").toBeTruthy();
  const rows = (await productsRes.json()) as Array<{
    id: string;
    slug: string;
    name: string;
    price: number;
    image_url: string | null;
    stock: number;
  }>;
  const product = rows.find((p) => (p.stock ?? 0) > 0) ?? rows[0];
  expect(product?.id, "must have at least one live product to test").toBeTruthy();

  // 2. Intercept the create-checkout edge function BEFORE navigating so the
  //    real function is never touched. Capture the request body for assertions.
  let capturedBody: any = null;
  let invokeHits = 0;

  await page.route("**/functions/v1/create-checkout", async (route) => {
    invokeHits += 1;
    const req = route.request();
    try {
      capturedBody = req.postDataJSON();
    } catch {
      capturedBody = req.postData();
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ url: MOCK_STRIPE_URL, sessionId: "cs_test_mock_forensic" }),
    });
  });

  // Deterministic shipping pre-check: force the products lookup to return a
  // US warehouse so `checkCartShipping` resolves to ok=true immediately and
  // the Checkout CTA is never gated on network races.
  //   Return `supplier_warehouse: null` → normalizeWarehouse → "UNKNOWN"
  //   which routes as CN (ships globally, including whatever country
  //   geo-classify infers), so the check is unconditionally ok.
  await page.route(/\/rest\/v1\/products\?.*(supplier_warehouse|select=)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: {
        "access-control-allow-origin": "*",
        "content-range": "0-0/1",
      },
      body: JSON.stringify([{ id: product.id, supplier_warehouse: null }]),
    });
  });

  // Also force geo-classify to a supported country so we never flake on
  // whatever IP the test runner happens to have.
  await page.route("**/functions/v1/geo-classify", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        country: "US",
        region: null,
        city: null,
        geo_tier: "tier_1",
        geo_quality: "confident",
        us_tier: "us_domestic",
        country_source: "mock",
        ts: new Date().toISOString(),
      }),
    });
  });

  // 3. Prevent the app from actually navigating to Stripe — abort any request
  //    to checkout.stripe.com so the browser stays on our origin and we can
  //    inspect the navigation attempt.
  const stripeNavigationHits: string[] = [];
  await page.route("https://checkout.stripe.com/**", async (route) => {
    stripeNavigationHits.push(route.request().url());
    await route.abort();
  });

  // 4. Seed the cart directly in localStorage using the same shape CartContext
  //    persists (JSON array under `pawsy-cart`).
  await page.goto("/robots.txt", { waitUntil: "domcontentloaded" });
  const cartItem = {
    id: `${product.id}-mock-variant`,
    productId: product.id,
    slug: product.slug,
    name: product.name,
    price: product.price,
    quantity: 1,
    image: product.image_url ?? "",
  };
  await page.evaluate((item) => {
    localStorage.setItem("pawsy-cart", JSON.stringify([item]));
  }, cartItem);

  // 5. Go to /checkout in the seeded state.
  const resp = await page.goto("/checkout", { waitUntil: "domcontentloaded" });
  expect(resp?.status(), "checkout page must render").toBeLessThan(400);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1000);

  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(body, "checkout must not show error boundary").not.toContain("something went wrong");
  expect(body, "checkout must not show empty cart with a seeded item").not.toContain(
    "your cart is empty",
  );

  // 6. Fill the two hard gates: email + terms checkbox.
  const emailInput = page
    .locator("input#email, input[type='email']")
    .first();
  await emailInput.waitFor({ state: "visible", timeout: 10_000 });
  await emailInput.fill("forensic-e2e@example.test");

  // Terms checkbox — Radix. Try role-based check first; fall back to
  // dispatching a native click on the trigger.
  const termsBox = page.getByRole("checkbox", { name: /terms|accept/i }).first();
  try {
    await termsBox.check({ timeout: 3_000 });
  } catch {
    const t = page.locator("#terms").first();
    const h = await t.elementHandle();
    await h?.evaluate((el) => (el as HTMLElement).click());
  }
  await expect
    .poll(
      async () =>
        page.evaluate(
          () =>
            document.getElementById("terms")?.getAttribute("data-state") ??
            document.getElementById("terms")?.getAttribute("aria-checked"),
        ),
      { timeout: 5_000, message: "terms checkbox must reach checked state" },
    )
    .toMatch(/checked|true/);

  // 7. Click the Stripe checkout button — testids are the stable contract.
  //    Try desktop first, fall back to mobile (viewport-dependent visibility).
  const desktopBtn = page.locator('[data-testid="checkout-cta-desktop"]').first();
  const mobileBtn = page.locator('[data-testid="checkout-cta-mobile"]').first();
  let stripeBtn = desktopBtn;
  try {
    await desktopBtn.waitFor({ state: "visible", timeout: 4_000 });
  } catch {
    stripeBtn = mobileBtn;
    await mobileBtn.waitFor({ state: "visible", timeout: 6_000 });
  }
  await stripeBtn.scrollIntoViewIfNeeded();
  // Wait for shipping pre-check to settle so the CTA is no longer disabled.
  await expect(stripeBtn, "checkout CTA must become enabled").toBeEnabled({ timeout: 20_000 });
  // Kill dev-only overlays that intercept pointer events on the CTA.
  await page.evaluate(() => {
    document
      .querySelectorAll('#ttq-pixel-config-banner, [id*="dev-geo-consent" i]')
      .forEach((el) => el.remove());
  });
  // Dispatch a native click directly on the button element — bypasses any
  // remaining overlay hit-testing without giving up correctness (the same
  // React onClick handler runs).
  const preClickState = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="checkout-cta-desktop"]') as HTMLButtonElement | null;
    const email = (document.querySelector("#email") as HTMLInputElement | null)?.value ?? "";
    const terms = document.getElementById("terms");
    return {
      btnDisabled: btn?.disabled ?? null,
      btnText: btn?.innerText ?? null,
      email,
      termsState: terms?.getAttribute("data-state") ?? terms?.getAttribute("aria-checked") ?? null,
    };
  });
  console.log("preClickState", preClickState);
  const handle = await stripeBtn.elementHandle();
  await handle?.evaluate((el) => (el as HTMLButtonElement).click());
  await page.waitForTimeout(500);

  // 8. Wait for the mocked invoke AND the aborted Stripe navigation.
  try {
    await expect
      .poll(() => invokeHits, { timeout: 15_000, message: "create-checkout must be invoked" })
      .toBeGreaterThan(0);
  } catch (e) {
    console.log("=== console dump (invoke never fired) ===");
    console.log(consoleLines.slice(-60).join("\n"));
    throw e;
  }
  await expect
    .poll(() => stripeNavigationHits.length, {
      timeout: 10_000,
      message: "app must attempt to navigate to Stripe with the returned URL",
    })
    .toBeGreaterThan(0);

  // 9. Assert payload shape.
  expect(capturedBody, "create-checkout must receive a JSON body").toBeTruthy();
  expect(capturedBody.customerEmail).toBe("forensic-e2e@example.test");
  expect(Array.isArray(capturedBody.items), "items must be an array").toBeTruthy();
  expect(capturedBody.items.length).toBeGreaterThan(0);
  const line = capturedBody.items[0];
  expect(line.id).toBe(cartItem.id);
  expect(line.name).toBe(product.name);
  expect(typeof line.price).toBe("number");
  expect(line.price).toBeGreaterThan(0);
  expect(line.quantity).toBe(1);
  // Optional but expected — shipping country defaults to US.
  if (capturedBody.shippingCountry !== undefined) {
    expect(typeof capturedBody.shippingCountry).toBe("string");
    expect(capturedBody.shippingCountry.length).toBeGreaterThan(0);
  }

  // 10. Assert the redirect target was our mocked Stripe URL.
  expect(stripeNavigationHits.some((u) => u === MOCK_STRIPE_URL)).toBeTruthy();
});

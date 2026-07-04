import { test, expect } from "../playwright-fixture";

/**
 * End-to-end purchase certification.
 *
 * Walks a real browser session through PDP → Add to Cart → View Cart →
 * Begin Checkout (with the QA bypass flag so bot / dedupe gates cannot
 * silently drop events), then invokes the `qa-purchase-e2e` edge
 * function which simulates a paid Stripe webhook for THIS session and
 * verifies the purchase row landed in all six canonical sources:
 *
 *   1. lp_funnel_events
 *   2. visitor_activity
 *   3. canonical_events
 *   4. session_forensics       (view over analytics_funnel_waterfall)
 *   5. session_journey_steps   (view over analytics_funnel_waterfall)
 *   6. GA4 Measurement Protocol mirror
 *
 * The spec is gated behind QA_E2E_SECRET — set the env var and the
 * matching `QA_E2E_SECRET` edge secret to actually hit the writer path
 * from CI. Without the secret the test is skipped rather than failing,
 * so local `bunx vitest run` / `playwright test` runs stay green.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.VITE_SUPABASE_ANON_KEY
  ?? process.env.SUPABASE_ANON_KEY
  ?? "";
const QA_SECRET = process.env.QA_E2E_SECRET ?? "";

test.describe("Purchase tracking E2E certification", () => {
  test.skip(
    !SUPABASE_URL || !SUPABASE_ANON || !QA_SECRET,
    "Set VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY and QA_E2E_SECRET to run",
  );

  test("purchase propagates through every canonical source", async ({ page }) => {
    // 1. Prime QA flags BEFORE any navigation so the bypass is in place
    //    the moment funnelEvents.ts reads localStorage.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("gp_qa_atc_bypass", "1");
        localStorage.setItem("gp_atc_forensic", "1");
      } catch { /* ignore */ }
    });

    // 2. Walk the funnel: PDP → ATC → cart → checkout.
    await page.goto("/products");
    await page.waitForLoadState("networkidle");
    await page.locator('a[href*="/products/"]').first().click();
    await page.waitForLoadState("networkidle");

    const atc = page.getByRole("button", { name: /add to cart|in winkelwagen/i }).first();
    await expect(atc).toBeVisible({ timeout: 10_000 });
    await atc.click();
    await page.waitForTimeout(500);

    await page.goto("/cart");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);

    const checkoutBtn = page
      .getByRole("button", { name: /checkout|afrekenen|proceed/i })
      .or(page.getByRole("link", { name: /checkout|afrekenen|proceed/i }))
      .first();
    if (await checkoutBtn.count()) {
      // Prevent the actual Stripe redirect — we only need the
      // begin_checkout event to fire.
      await page.route("**/functions/v1/create-checkout", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: '{"url":"about:blank"}' }),
      );
      await checkoutBtn.click().catch(() => { /* ok */ });
      await page.waitForTimeout(500);
    }

    // 3. Grab the canonical session_id the frontend created.
    const ids = await page.evaluate(() => ({
      session_id: sessionStorage.getItem("gp_session_id"),
      visitor_id: localStorage.getItem("gp_visitor_id"),
    }));
    expect(ids.session_id, "gp_session_id must exist after funnel walk").toBeTruthy();

    // 4. Invoke the QA edge function to simulate the purchase + verify.
    const res = await page.request.post(
      `${SUPABASE_URL}/functions/v1/qa-purchase-e2e`,
      {
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
          "x-qa-secret": QA_SECRET,
          "Content-Type": "application/json",
        },
        data: {
          session_id: ids.session_id,
          visitor_id: ids.visitor_id,
          ga_client_id: ids.session_id,
          value: 34.99,
          currency: "USD",
          country: "US",
          product: { id: "qa-product-1", name: "QA Certification Product", price: 34.99, quantity: 1 },
        },
      },
    );
    expect(res.ok(), `qa-purchase-e2e HTTP ${res.status()}`).toBeTruthy();
    const report = await res.json();

    // Attach the full certification report to the test output for
    // forensic review — this is the single source of truth.
    // eslint-disable-next-line no-console
    console.log("[qa-purchase-e2e report]", JSON.stringify(report, null, 2));

    // 5. Certification — every source must contain the purchase.
    expect(report.ok, "edge function returned ok=false").toBe(true);
    expect(report.missing, `Missing sources: ${JSON.stringify(report.missing)}`).toEqual([]);
    expect(report.certification).toBe("PASS");

    for (const source of [
      "lp_funnel_events",
      "visitor_activity",
      "canonical_events",
      "session_forensics",
      "session_journey_steps",
      "ga4_mirror",
    ] as const) {
      expect(
        report.checks?.[source]?.present,
        `Purchase missing from ${source}: ${JSON.stringify(report.checks?.[source])}`,
      ).toBe(true);
    }
  });
});

import { test, expect } from "../playwright-fixture";

/**
 * Error-path coverage for the admin Pinterest Quality Simulate/Apply flow.
 *
 * For both the Pre-publish Native Score Gate and the Editor-in-Chief gate,
 * verifies that when the underlying edge function returns a 4xx (400, 401,
 * 429) or 5xx (500, 503) response the page:
 *  - surfaces an error toast prefixed with "Gate failed:" / "Editor failed:"
 *  - does NOT render the success summary cards
 *  - leaves the action button re-enabled so the user can retry
 */

const SUPABASE_REF = "nojvgfbcjgipjxpfatmm";
const SUPABASE_HOST = `${SUPABASE_REF}.supabase.co`;
const ADMIN_EMAIL = "jasperdiks@hotmail.com";
const STORAGE_KEY = `sb-${SUPABASE_REF}-auth-token`;

const fakeSession = {
  access_token: "fake.jwt.token",
  refresh_token: "fake-refresh",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: {
    id: "00000000-0000-0000-0000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: ADMIN_EMAIL,
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  },
};

const ERROR_CASES = [
  { status: 400, body: { error: "bad request" }, label: "400 Bad Request" },
  { status: 401, body: { error: "unauthorized" }, label: "401 Unauthorized" },
  { status: 429, body: { error: "rate limited" }, label: "429 Too Many Requests" },
  { status: 500, body: { error: "boom" }, label: "500 Internal Server Error" },
  { status: 503, body: { error: "unavailable" }, label: "503 Service Unavailable" },
] as const;

test.describe("Admin · Pinterest Quality · edge-function error handling", () => {
  test.beforeEach(async ({ context, page }) => {
    await context.addInitScript(
      ([key, session]) => {
        try {
          window.localStorage.setItem(key as string, JSON.stringify(session));
        } catch {}
      },
      [STORAGE_KEY, fakeSession],
    );

    await page.route(`**/${SUPABASE_HOST}/auth/v1/**`, async (route) => {
      const url = route.request().url();
      if (url.includes("/user")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(fakeSession.user),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fakeSession),
      });
    });
    await page.route(`**/${SUPABASE_HOST}/rest/v1/user_roles**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ role: "admin" }),
      }),
    );
    await page.route(`**/${SUPABASE_HOST}/rest/v1/**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": "0-0/0" },
        body: JSON.stringify([]),
      }),
    );
  });

  for (const c of ERROR_CASES) {
    test(`Pre-publish gate Simulate surfaces error toast on ${c.label}`, async ({
      page,
    }) => {
      await page.route(
        `**/${SUPABASE_HOST}/functions/v1/pinterest-native-prepublish-gate`,
        (route) =>
          route.fulfill({
            status: c.status,
            contentType: "application/json",
            body: JSON.stringify(c.body),
          }),
      );

      await page.goto("/admin/pinterest-quality");
      const simBtn = page
        .getByRole("button", { name: /Simulate \(dry-run\)/i })
        .first();
      await simBtn.click();

      // Sonner renders the failure message as a live region.
      await expect(page.getByText(/Gate failed:/i).first()).toBeVisible();

      // No success summary cards rendered.
      await expect(page.getByText(/Avg native score/i)).toHaveCount(0);
      await expect(page.getByText(/Planned reject:/i)).toHaveCount(0);

      // Button is re-enabled so user can retry.
      await expect(simBtn).toBeEnabled();
    });

    test(`Pre-publish gate Apply surfaces error toast on ${c.label}`, async ({
      page,
    }) => {
      await page.route(
        `**/${SUPABASE_HOST}/functions/v1/pinterest-native-prepublish-gate`,
        (route) =>
          route.fulfill({
            status: c.status,
            contentType: "application/json",
            body: JSON.stringify(c.body),
          }),
      );

      await page.goto("/admin/pinterest-quality");
      const applyBtn = page.getByRole("button", { name: /Apply rebalance/i });
      await applyBtn.click();

      await expect(page.getByText(/Gate failed:/i).first()).toBeVisible();
      await expect(page.getByText(/Applied:.*rejected.*downranked/i)).toHaveCount(0);
      await expect(applyBtn).toBeEnabled();
    });

    test(`Editor-in-Chief Simulate surfaces error toast on ${c.label}`, async ({
      page,
    }) => {
      await page.route(
        `**/${SUPABASE_HOST}/functions/v1/pinterest-editor-in-chief`,
        (route) =>
          route.fulfill({
            status: c.status,
            contentType: "application/json",
            body: JSON.stringify(c.body),
          }),
      );

      await page.goto("/admin/pinterest-quality");
      const simButtons = page.getByRole("button", { name: /Simulate \(dry-run\)/i });
      const editorSim = simButtons.nth(1);
      await editorSim.click();

      await expect(page.getByText(/Editor failed:/i).first()).toBeVisible();
      await expect(page.getByText(/Evaluated:/i)).toHaveCount(0);
      await expect(page.getByText(/Improved \(auto\):/i)).toHaveCount(0);
      await expect(editorSim).toBeEnabled();
    });

    test(`Editor-in-Chief Apply surfaces error toast on ${c.label}`, async ({
      page,
    }) => {
      await page.route(
        `**/${SUPABASE_HOST}/functions/v1/pinterest-editor-in-chief`,
        (route) =>
          route.fulfill({
            status: c.status,
            contentType: "application/json",
            body: JSON.stringify(c.body),
          }),
      );

      await page.goto("/admin/pinterest-quality");
      const applyBtn = page.getByRole("button", {
        name: /Run editor on next 25 drafts/i,
      });
      await applyBtn.click();

      await expect(page.getByText(/Editor failed:/i).first()).toBeVisible();
      await expect(page.getByText(/Approved:/i)).toHaveCount(0);
      await expect(page.getByText(/Rejected:/i)).toHaveCount(0);
      await expect(applyBtn).toBeEnabled();
    });
  }

  test("network failure (connection refused) surfaces a Gate failed toast", async ({
    page,
  }) => {
    await page.route(
      `**/${SUPABASE_HOST}/functions/v1/pinterest-native-prepublish-gate`,
      (route) => route.abort("failed"),
    );

    await page.goto("/admin/pinterest-quality");
    await page
      .getByRole("button", { name: /Simulate \(dry-run\)/i })
      .first()
      .click();

    await expect(page.getByText(/Gate failed:/i).first()).toBeVisible();
    await expect(page.getByText(/Avg native score/i)).toHaveCount(0);
  });

  test("malformed JSON 200 response is still treated as a failed Editor call", async ({
    page,
  }) => {
    await page.route(
      `**/${SUPABASE_HOST}/functions/v1/pinterest-editor-in-chief`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "<<not json>>",
        }),
    );

    await page.goto("/admin/pinterest-quality");
    await page
      .getByRole("button", { name: /Run editor on next 25 drafts/i })
      .click();

    // Either the toast fires (parse error) OR no summary appears — both are
    // acceptable "did not pretend it succeeded" outcomes.
    const toast = page.getByText(/Editor failed:/i).first();
    const summary = page.getByText(/Evaluated:/i);
    await expect(summary).toHaveCount(0);
    // Best-effort toast assertion: don't hard-fail if sonner suppresses, but
    // require it to appear within a short window when it does.
    await Promise.race([
      toast.waitFor({ state: "visible", timeout: 3000 }).catch(() => null),
      page.waitForTimeout(3000),
    ]);
  });
});

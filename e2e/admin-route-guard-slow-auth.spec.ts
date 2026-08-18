import { test, expect } from "../playwright-fixture";

/**
 * Regression coverage for the AdminRouteGuard race condition:
 * a real admin must NEVER see "Access Denied" (nor be redirected to /auth)
 * while the session and/or the server-side role check are still resolving.
 */

const SUPABASE_REF = "nojvgfbcjgipjxpfatmm";
const SUPABASE_HOST = `${SUPABASE_REF}.supabase.co`;
const STORAGE_KEY = `sb-${SUPABASE_REF}-auth-token`;
const ADMIN_PATH = "/admin/pinterest-quality";

const adminUser = {
  id: "00000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "slow-admin@example.com",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: new Date().toISOString(),
};

const adminSession = {
  access_token: "fake.jwt.token",
  refresh_token: "fake-refresh",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: adminUser,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function seedSession(context: any) {
  await context.addInitScript(
    ([key, session]) => {
      try {
        window.localStorage.setItem(key as string, JSON.stringify(session));
      } catch {}
    },
    [STORAGE_KEY, adminSession],
  );
}

/** Everything except the routes a test overrides earlier resolves empty. */
async function stubRest(page: any) {
  await page.route(`**/${SUPABASE_HOST}/rest/v1/**`, (route: any) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/0" },
      body: JSON.stringify([]),
    }),
  );
}

async function expectNoDenial(page: any) {
  await expect(
    page.getByRole("heading", { name: /Access Denied/i }),
  ).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe(ADMIN_PATH);
}

test.describe("AdminRouteGuard · slow session/role resolution", () => {
  test("slow role check: no Access Denied while user_roles is in flight", async ({
    context,
    page,
  }) => {
    await seedSession(context);

    await page.route(`**/${SUPABASE_HOST}/auth/v1/**`, (route) => {
      const url = route.request().url();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(url.includes("/user") ? adminUser : adminSession),
      });
    });

    // Role check resolves slowly — this is the window where the old guard
    // wrongly rendered "Access Denied".
    await page.route(`**/${SUPABASE_HOST}/rest/v1/user_roles**`, async (route) => {
      await sleep(2500);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ role: "admin" }),
      });
    });
    await stubRest(page);

    await page.goto(ADMIN_PATH);

    // Sample the guard repeatedly while the role check is pending.
    for (let i = 0; i < 5; i++) {
      await expectNoDenial(page);
      await page.waitForTimeout(300);
    }

    // Once the role resolves, the admin page renders.
    await expect(
      page.getByRole("heading", { name: /Access Denied/i }),
    ).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator("body")).not.toContainText(/Access Denied/i);
  });

  test("slow session resolution: no premature redirect to /auth", async ({
    context,
    page,
  }) => {
    await seedSession(context);

    // getSession()/user resolve slowly — the guard must keep showing the
    // loading state instead of treating the visitor as logged out.
    await page.route(`**/${SUPABASE_HOST}/auth/v1/**`, async (route) => {
      const url = route.request().url();
      await sleep(2500);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(url.includes("/user") ? adminUser : adminSession),
      });
    });

    await page.route(`**/${SUPABASE_HOST}/rest/v1/user_roles**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ role: "admin" }),
      }),
    );
    await stubRest(page);

    await page.goto(ADMIN_PATH);

    for (let i = 0; i < 5; i++) {
      expect(new URL(page.url()).pathname).toBe(ADMIN_PATH);
      await expect(
        page.getByRole("heading", { name: /Access Denied/i }),
      ).toHaveCount(0);
      await page.waitForTimeout(300);
    }

    await page.waitForTimeout(2500);
    await expectNoDenial(page);
  });
});

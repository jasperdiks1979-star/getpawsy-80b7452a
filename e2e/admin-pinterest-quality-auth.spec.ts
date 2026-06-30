import { test, expect } from "../playwright-fixture";

/**
 * Auth-guard coverage for the admin Pinterest Quality Simulate/Apply flow.
 *
 * Verifies that:
 *  1. Anonymous visitors to /admin/pinterest-quality are redirected to /auth
 *     with a `next` param preserving the original path, and NEVER reach the
 *     Simulate/Apply controls.
 *  2. Logged-in non-admin users see the "Access Denied" error UI rendered by
 *     AdminRouteGuard and likewise cannot see or click the gate controls.
 *  3. Even if a determined client tries to invoke the gate edge functions
 *     without an Authorization header, the backend rejects the call (401),
 *     i.e. the Simulate/Apply flow is not reachable without a session.
 */

const SUPABASE_REF = "nojvgfbcjgipjxpfatmm";
const SUPABASE_HOST = `${SUPABASE_REF}.supabase.co`;
const STORAGE_KEY = `sb-${SUPABASE_REF}-auth-token`;

const nonAdminSession = {
  access_token: "fake.jwt.token",
  refresh_token: "fake-refresh",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: {
    id: "00000000-0000-0000-0000-000000000002",
    aud: "authenticated",
    role: "authenticated",
    email: "not-an-admin@example.com",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: new Date().toISOString(),
  },
};

test.describe("Admin · Pinterest Quality · auth guard", () => {
  test("anonymous visitor is redirected to /auth and never sees Simulate/Apply", async ({
    page,
  }) => {
    // No session seeded. Stub auth endpoints to return "no user".
    await page.route(`**/${SUPABASE_HOST}/auth/v1/**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: null, session: null }),
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

    // If the page ever tried to call the gate functions, fail the test.
    const forbiddenCalls: string[] = [];
    await page.route(
      `**/${SUPABASE_HOST}/functions/v1/pinterest-native-prepublish-gate`,
      (route) => {
        forbiddenCalls.push(route.request().url());
        return route.fulfill({ status: 401, body: "unauthorized" });
      },
    );
    await page.route(
      `**/${SUPABASE_HOST}/functions/v1/pinterest-editor-in-chief`,
      (route) => {
        forbiddenCalls.push(route.request().url());
        return route.fulfill({ status: 401, body: "unauthorized" });
      },
    );

    await page.goto("/admin/pinterest-quality");

    // Guard redirects to /auth?next=<encoded path>
    await page.waitForURL(/\/auth\?next=/);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/auth");
    expect(url.searchParams.get("next")).toBe("/admin/pinterest-quality");

    // Controls must not be present.
    await expect(
      page.getByRole("button", { name: /Simulate \(dry-run\)/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Apply rebalance/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Run editor on next 25 drafts/i }),
    ).toHaveCount(0);

    // And no edge function call leaked out.
    expect(forbiddenCalls).toEqual([]);
  });

  test("logged-in non-admin user sees Access Denied and cannot trigger gates", async ({
    context,
    page,
  }) => {
    // Seed a real-looking session for a NON-allowlisted email.
    await context.addInitScript(
      ([key, session]) => {
        try {
          window.localStorage.setItem(key as string, JSON.stringify(session));
        } catch {}
      },
      [STORAGE_KEY, nonAdminSession],
    );

    await page.route(`**/${SUPABASE_HOST}/auth/v1/**`, (route) => {
      const url = route.request().url();
      if (url.includes("/user")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(nonAdminSession.user),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(nonAdminSession),
      });
    });

    // DB role check returns NO admin row -> isAdmin === false.
    await page.route(`**/${SUPABASE_HOST}/rest/v1/user_roles**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": "0-0/0" },
        body: JSON.stringify(null),
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

    const forbiddenCalls: string[] = [];
    await page.route(
      `**/${SUPABASE_HOST}/functions/v1/pinterest-native-prepublish-gate`,
      (route) => {
        forbiddenCalls.push(route.request().url());
        return route.fulfill({ status: 401, body: "unauthorized" });
      },
    );
    await page.route(
      `**/${SUPABASE_HOST}/functions/v1/pinterest-editor-in-chief`,
      (route) => {
        forbiddenCalls.push(route.request().url());
        return route.fulfill({ status: 401, body: "unauthorized" });
      },
    );

    await page.goto("/admin/pinterest-quality");

    // AdminRouteGuard renders the Access Denied UI.
    await expect(
      page.getByRole("heading", { name: /Access Denied/i }),
    ).toBeVisible();
    await expect(page.getByText(nonAdminSession.user.email)).toBeVisible();

    // Gate controls must not render.
    await expect(
      page.getByRole("button", { name: /Simulate \(dry-run\)/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Apply rebalance/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Run editor on next 25 drafts/i }),
    ).toHaveCount(0);

    expect(forbiddenCalls).toEqual([]);
  });

  test("edge functions reject Simulate/Apply calls without an Authorization header", async ({
    request,
  }) => {
    // Direct unauthenticated POST to the deployed edge functions should be
    // refused — this is the server-side half of the auth guard.
    const gate = await request.post(
      `https://${SUPABASE_HOST}/functions/v1/pinterest-native-prepublish-gate`,
      { data: { dryRun: true, sampleSize: 1 }, failOnStatusCode: false },
    );
    expect([401, 403]).toContain(gate.status());

    const editor = await request.post(
      `https://${SUPABASE_HOST}/functions/v1/pinterest-editor-in-chief`,
      { data: { dryRun: true, limit: 1 }, failOnStatusCode: false },
    );
    expect([401, 403]).toContain(editor.status());
  });
});

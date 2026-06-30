import { test, expect } from "../playwright-fixture";

/**
 * End-to-end coverage for the admin "Pinterest Quality" page gate controls.
 *
 * Both the Pre-publish Native Score Gate and the Editor-in-Chief gate live
 * behind /admin/* and call Supabase Edge Functions. These tests:
 *
 * 1. Seed a fake Supabase session in localStorage with an allowlisted admin
 *    email so AdminRouteGuard renders the page.
 * 2. Stub every Supabase auth / REST / functions call the page issues so the
 *    suite is hermetic and independent of backend state.
 * 3. Click Simulate (dry-run) and Apply for both gates, asserting that the
 *    correct edge function is invoked with the expected payload AND that the
 *    rendered summary reflects the stubbed response.
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

const gateSimulatePayload = {
  ok: true,
  traceId: "trace-gate-sim",
  dryRun: true,
  sampleSize: 300,
  minScore: 55,
  avgNativeScore: 47,
  mix: {
    lifestyle: { share: 0.10, target: 0.30, over: false },
    product_showcase: { share: 0.62, target: 0.05, over: true },
  },
  overCategories: { cat_tree: 60 },
  drafts: 25,
  counts: { reject: 8, downrank: 12, keep: 5 },
  applied: { rejects: 0, downranks: 0 },
  actions: [],
};

const gateApplyPayload = {
  ...gateSimulatePayload,
  traceId: "trace-gate-apply",
  dryRun: false,
  applied: { rejects: 8, downranks: 12 },
};

const editorSimulatePayload = {
  ok: true,
  traceId: "trace-editor-sim",
  dryRun: true,
  minScore: 70,
  maxIter: 2,
  feed: { used: true },
  summary: {
    evaluated: 25,
    approved: 9,
    downranked: 10,
    rejected: 6,
    improved: 4,
    iterations: 7,
  },
  decisions: [],
};

const editorApplyPayload = {
  ...editorSimulatePayload,
  traceId: "trace-editor-apply",
  dryRun: false,
  summary: { ...editorSimulatePayload.summary, approved: 12, rejected: 4 },
};

test.describe("Admin · Pinterest Quality · gate Simulate / Apply", () => {
  test.beforeEach(async ({ context, page }) => {
    // 1. Seed Supabase session BEFORE the app boots so AuthContext picks it up
    //    synchronously and AdminRouteGuard renders children.
    await context.addInitScript(
      ([key, session]) => {
        try {
          window.localStorage.setItem(key as string, JSON.stringify(session));
        } catch {}
      },
      [STORAGE_KEY, fakeSession],
    );

    // 2. Stub all Supabase auth endpoints to return our fake session/user.
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

    // 3. Resolve the admin role check via DB and the counts queries.
    await page.route(`**/${SUPABASE_HOST}/rest/v1/user_roles**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ role: "admin" }),
      }),
    );
    await page.route(`**/${SUPABASE_HOST}/rest/v1/pinterest_pin_queue**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": "0-0/0" },
        body: JSON.stringify([]),
      }),
    );
    // Catch-all for any other REST table the page might touch.
    await page.route(`**/${SUPABASE_HOST}/rest/v1/**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": "0-0/0" },
        body: JSON.stringify([]),
      }),
    );
  });

  test("Pre-publish gate: Simulate (dry-run) invokes function and renders mix + summary", async ({
    page,
  }) => {
    const fnCalls: Array<{ url: string; body: any }> = [];
    await page.route(
      `**/${SUPABASE_HOST}/functions/v1/pinterest-native-prepublish-gate`,
      async (route) => {
        const req = route.request();
        const body = req.postDataJSON?.() ?? JSON.parse(req.postData() || "{}");
        fnCalls.push({ url: req.url(), body });
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(body?.dryRun === false ? gateApplyPayload : gateSimulatePayload),
        });
      },
    );

    await page.goto("/admin/pinterest-quality");
    await page
      .getByRole("button", { name: /Simulate \(dry-run\)/i })
      .first()
      .click();

    await expect(page.getByText(/Avg native score/i)).toBeVisible();
    await expect(page.getByText("47")).toBeVisible();
    await expect(page.getByText(/Planned reject: 8/)).toBeVisible();

    expect(fnCalls).toHaveLength(1);
    expect(fnCalls[0].body).toMatchObject({ dryRun: true, sampleSize: 300 });
  });

  test("Pre-publish gate: Apply rebalance invokes function with dryRun=false and surfaces applied counts", async ({
    page,
  }) => {
    const fnCalls: Array<{ body: any }> = [];
    await page.route(
      `**/${SUPABASE_HOST}/functions/v1/pinterest-native-prepublish-gate`,
      async (route) => {
        const req = route.request();
        const body = req.postDataJSON?.() ?? JSON.parse(req.postData() || "{}");
        fnCalls.push({ body });
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(body?.dryRun === false ? gateApplyPayload : gateSimulatePayload),
        });
      },
    );

    await page.goto("/admin/pinterest-quality");
    await page.getByRole("button", { name: /Apply rebalance/i }).click();

    await expect(page.getByText(/Applied: 8 rejected, 12 downranked/i)).toBeVisible();
    expect(fnCalls).toHaveLength(1);
    expect(fnCalls[0].body).toMatchObject({ dryRun: false });
  });

  test("Editor-in-Chief: Simulate invokes editor function and renders summary", async ({
    page,
  }) => {
    const fnCalls: Array<{ body: any }> = [];
    await page.route(
      `**/${SUPABASE_HOST}/functions/v1/pinterest-editor-in-chief`,
      async (route) => {
        const req = route.request();
        const body = req.postDataJSON?.() ?? JSON.parse(req.postData() || "{}");
        fnCalls.push({ body });
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(body?.dryRun === false ? editorApplyPayload : editorSimulatePayload),
        });
      },
    );

    await page.goto("/admin/pinterest-quality");
    // The 2nd "Simulate (dry-run)" button belongs to the Editor-in-Chief card.
    const simButtons = page.getByRole("button", { name: /Simulate \(dry-run\)/i });
    await simButtons.nth(1).click();

    await expect(page.getByText(/Evaluated:/i)).toBeVisible();
    await expect(page.getByText(/Improved \(auto\):/i)).toBeVisible();
    await expect(page.getByText(/across 7 iterations/i)).toBeVisible();

    expect(fnCalls).toHaveLength(1);
    expect(fnCalls[0].body).toMatchObject({
      dryRun: true,
      limit: 25,
      minScore: 70,
      maxIterations: 2,
    });
  });

  test("Editor-in-Chief: Apply invokes editor with dryRun=false and renders updated counts", async ({
    page,
  }) => {
    const fnCalls: Array<{ body: any }> = [];
    await page.route(
      `**/${SUPABASE_HOST}/functions/v1/pinterest-editor-in-chief`,
      async (route) => {
        const req = route.request();
        const body = req.postDataJSON?.() ?? JSON.parse(req.postData() || "{}");
        fnCalls.push({ body });
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(body?.dryRun === false ? editorApplyPayload : editorSimulatePayload),
        });
      },
    );

    await page.goto("/admin/pinterest-quality");
    await page
      .getByRole("button", { name: /Run editor on next 25 drafts/i })
      .click();

    await expect(page.getByText(/Approved:/i)).toBeVisible();
    await expect(page.getByText(/Rejected:/i)).toBeVisible();
    expect(fnCalls).toHaveLength(1);
    expect(fnCalls[0].body).toMatchObject({ dryRun: false });
  });
});
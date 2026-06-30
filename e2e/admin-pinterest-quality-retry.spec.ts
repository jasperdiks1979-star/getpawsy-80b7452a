import { test, expect } from "../playwright-fixture";

/**
 * Retry-after-failure coverage for the admin Pinterest Quality flow.
 *
 * For each gate (Pre-publish + Editor-in-Chief) and each action
 * (Simulate dry-run + Apply), the first edge-function call fails with a 500
 * and the second succeeds. The spec asserts that:
 *  1. The first click surfaces the error toast and renders no summary.
 *  2. The button re-enables.
 *  3. The second click invokes the function again and renders the correct
 *     success summary with the expected payload values.
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
  traceId: "trace-gate-sim-retry",
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
  traceId: "trace-gate-apply-retry",
  dryRun: false,
  applied: { rejects: 8, downranks: 12 },
};

const editorSimulatePayload = {
  ok: true,
  traceId: "trace-editor-sim-retry",
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
  traceId: "trace-editor-apply-retry",
  dryRun: false,
  summary: { ...editorSimulatePayload.summary, approved: 12, rejected: 4 },
};

test.describe("Admin · Pinterest Quality · retry after edge-function failure", () => {
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

  test("Pre-publish gate Simulate: fail then retry renders the success summary", async ({
    page,
  }) => {
    let attempt = 0;
    await page.route(
      `**/${SUPABASE_HOST}/functions/v1/pinterest-native-prepublish-gate`,
      (route) => {
        attempt++;
        if (attempt === 1) {
          return route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "boom" }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(gateSimulatePayload),
        });
      },
    );

    await page.goto("/admin/pinterest-quality");
    const simBtn = page
      .getByRole("button", { name: /Simulate \(dry-run\)/i })
      .first();

    // First click fails.
    await simBtn.click();
    await expect(page.getByText(/Gate failed:/i).first()).toBeVisible();
    await expect(page.getByText(/Avg native score/i)).toHaveCount(0);
    await expect(simBtn).toBeEnabled();

    // Retry succeeds.
    await simBtn.click();
    await expect(page.getByText(/Avg native score/i)).toBeVisible();
    await expect(page.getByText("47")).toBeVisible();
    await expect(page.getByText(/Planned reject: 8/)).toBeVisible();
    expect(attempt).toBe(2);
  });

  test("Pre-publish gate Apply: fail then retry renders applied counts", async ({
    page,
  }) => {
    let attempt = 0;
    await page.route(
      `**/${SUPABASE_HOST}/functions/v1/pinterest-native-prepublish-gate`,
      (route) => {
        attempt++;
        if (attempt === 1) {
          return route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "unavailable" }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(gateApplyPayload),
        });
      },
    );

    await page.goto("/admin/pinterest-quality");
    const applyBtn = page.getByRole("button", { name: /Apply rebalance/i });

    await applyBtn.click();
    await expect(page.getByText(/Gate failed:/i).first()).toBeVisible();
    await expect(
      page.getByText(/Applied: 8 rejected, 12 downranked/i),
    ).toHaveCount(0);
    await expect(applyBtn).toBeEnabled();

    await applyBtn.click();
    await expect(
      page.getByText(/Applied: 8 rejected, 12 downranked/i),
    ).toBeVisible();
    expect(attempt).toBe(2);
  });

  test("Editor-in-Chief Simulate: fail then retry renders evaluation summary", async ({
    page,
  }) => {
    let attempt = 0;
    await page.route(
      `**/${SUPABASE_HOST}/functions/v1/pinterest-editor-in-chief`,
      (route) => {
        attempt++;
        if (attempt === 1) {
          return route.fulfill({
            status: 429,
            contentType: "application/json",
            body: JSON.stringify({ error: "rate limited" }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(editorSimulatePayload),
        });
      },
    );

    await page.goto("/admin/pinterest-quality");
    const editorSim = page
      .getByRole("button", { name: /Simulate \(dry-run\)/i })
      .nth(1);

    await editorSim.click();
    await expect(page.getByText(/Editor failed:/i).first()).toBeVisible();
    await expect(page.getByText(/Evaluated:/i)).toHaveCount(0);
    await expect(editorSim).toBeEnabled();

    await editorSim.click();
    await expect(page.getByText(/Evaluated:/i)).toBeVisible();
    await expect(page.getByText(/Improved \(auto\):/i)).toBeVisible();
    await expect(page.getByText(/across 7 iterations/i)).toBeVisible();
    expect(attempt).toBe(2);
  });

  test("Editor-in-Chief Apply: fail then retry renders updated counts", async ({
    page,
  }) => {
    let attempt = 0;
    await page.route(
      `**/${SUPABASE_HOST}/functions/v1/pinterest-editor-in-chief`,
      (route) => {
        attempt++;
        if (attempt === 1) {
          return route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "boom" }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(editorApplyPayload),
        });
      },
    );

    await page.goto("/admin/pinterest-quality");
    const applyBtn = page.getByRole("button", {
      name: /Run editor on next 25 drafts/i,
    });

    await applyBtn.click();
    await expect(page.getByText(/Editor failed:/i).first()).toBeVisible();
    await expect(page.getByText(/Approved:/i)).toHaveCount(0);
    await expect(applyBtn).toBeEnabled();

    await applyBtn.click();
    await expect(page.getByText(/Approved:/i)).toBeVisible();
    await expect(page.getByText(/Rejected:/i)).toBeVisible();
    expect(attempt).toBe(2);
  });
});

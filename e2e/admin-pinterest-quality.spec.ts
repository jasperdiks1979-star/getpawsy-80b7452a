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

/**
 * In-memory model of the pinterest_pin_queue table. The stubbed edge
 * functions mutate this map exactly the way the real ones would (status
 * transitions on draft rows), and the REST stub serves rows from it so the
 * tests can assert end-to-end DB state changes after Apply.
 */
type DraftRow = {
  id: string;
  status: "draft" | "rejected" | "downranked" | "approved";
  native_score: number;
  category: string;
};

function seedDrafts(count: number): Map<string, DraftRow> {
  const m = new Map<string, DraftRow>();
  for (let i = 0; i < count; i++) {
    m.set(`d-${i}`, {
      id: `d-${i}`,
      status: "draft",
      native_score: 40 + (i % 30),
      category: i % 3 === 0 ? "cat_tree" : "lifestyle",
    });
  }
  return m;
}

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
    // Catch-all for any other REST table the page might touch. Individual
    // tests can override the pinterest_pin_queue route to model DB state.
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

  test("Pre-publish gate: Apply mutates pinterest_pin_queue rows (DB state assertion)", async ({
    page,
  }) => {
    const drafts = seedDrafts(25);

    // Override the queue REST endpoint so reads reflect our in-memory model.
    await page.route(
      `**/${SUPABASE_HOST}/rest/v1/pinterest_pin_queue**`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "content-range": `0-${drafts.size - 1}/${drafts.size}` },
          body: JSON.stringify(Array.from(drafts.values())),
        }),
    );

    // Apply mutates 8 drafts -> rejected, 12 -> downranked, matching the
    // payload's counts.reject / counts.downrank values.
    await page.route(
      `**/${SUPABASE_HOST}/functions/v1/pinterest-native-prepublish-gate`,
      async (route) => {
        const req = route.request();
        const body = req.postDataJSON?.() ?? JSON.parse(req.postData() || "{}");
        if (body?.dryRun === false) {
          const ids = Array.from(drafts.keys());
          for (let i = 0; i < 8; i++) drafts.get(ids[i])!.status = "rejected";
          for (let i = 8; i < 20; i++) drafts.get(ids[i])!.status = "downranked";
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            body?.dryRun === false ? gateApplyPayload : gateSimulatePayload,
          ),
        });
      },
    );

    await page.goto("/admin/pinterest-quality");

    // Pre-condition: nothing rejected/downranked yet.
    expect(
      Array.from(drafts.values()).filter((d) => d.status === "rejected"),
    ).toHaveLength(0);
    expect(
      Array.from(drafts.values()).filter((d) => d.status === "downranked"),
    ).toHaveLength(0);

    await page.getByRole("button", { name: /Apply rebalance/i }).click();
    await expect(
      page.getByText(/Applied: 8 rejected, 12 downranked/i),
    ).toBeVisible();

    // Post-condition: DB state changed exactly as the gate promised.
    const rejected = Array.from(drafts.values()).filter(
      (d) => d.status === "rejected",
    );
    const downranked = Array.from(drafts.values()).filter(
      (d) => d.status === "downranked",
    );
    expect(rejected).toHaveLength(8);
    expect(downranked).toHaveLength(12);

    // Verify the page-context REST client also sees the new state.
    const res = await page.request.get(
      `https://${SUPABASE_HOST}/rest/v1/pinterest_pin_queue?select=id,status`,
      { headers: { apikey: "test" } },
    );
    const rows = (await res.json()) as DraftRow[];
    expect(rows.filter((r) => r.status === "rejected")).toHaveLength(8);
    expect(rows.filter((r) => r.status === "downranked")).toHaveLength(12);
  });

  test("Editor-in-Chief: Apply mutates pinterest_pin_queue rows (DB state assertion)", async ({
    page,
  }) => {
    const drafts = seedDrafts(25);

    await page.route(
      `**/${SUPABASE_HOST}/rest/v1/pinterest_pin_queue**`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "content-range": `0-${drafts.size - 1}/${drafts.size}` },
          body: JSON.stringify(Array.from(drafts.values())),
        }),
    );

    // editorApplyPayload.summary: approved 12, downranked 10, rejected 4 (-1 leftover).
    await page.route(
      `**/${SUPABASE_HOST}/functions/v1/pinterest-editor-in-chief`,
      async (route) => {
        const req = route.request();
        const body = req.postDataJSON?.() ?? JSON.parse(req.postData() || "{}");
        if (body?.dryRun === false) {
          const ids = Array.from(drafts.keys());
          for (let i = 0; i < 12; i++) drafts.get(ids[i])!.status = "approved";
          for (let i = 12; i < 22; i++) drafts.get(ids[i])!.status = "downranked";
          for (let i = 22; i < 25; i++) drafts.get(ids[i])!.status = "rejected";
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            body?.dryRun === false ? editorApplyPayload : editorSimulatePayload,
          ),
        });
      },
    );

    await page.goto("/admin/pinterest-quality");
    expect(
      Array.from(drafts.values()).every((d) => d.status === "draft"),
    ).toBe(true);

    await page
      .getByRole("button", { name: /Run editor on next 25 drafts/i })
      .click();
    await expect(page.getByText(/Approved:/i)).toBeVisible();
    await expect(page.getByText(/Rejected:/i)).toBeVisible();

    const byStatus = (s: DraftRow["status"]) =>
      Array.from(drafts.values()).filter((d) => d.status === s).length;
    expect(byStatus("approved")).toBe(12);
    expect(byStatus("downranked")).toBe(10);
    expect(byStatus("rejected")).toBe(3);
    expect(byStatus("draft")).toBe(0);

    const res = await page.request.get(
      `https://${SUPABASE_HOST}/rest/v1/pinterest_pin_queue?select=id,status`,
      { headers: { apikey: "test" } },
    );
    const rows = (await res.json()) as DraftRow[];
    expect(rows.filter((r) => r.status === "approved")).toHaveLength(12);
    expect(rows.filter((r) => r.status === "downranked")).toHaveLength(10);
    expect(rows.filter((r) => r.status === "rejected")).toHaveLength(3);
  });
});
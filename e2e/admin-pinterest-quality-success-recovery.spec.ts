import { test, expect } from "../playwright-fixture";

/**
 * Success-path loading-recovery coverage for the admin Pinterest Quality page.
 *
 * For each of the four actions (gate Simulate, gate Apply, editor Simulate,
 * editor Apply) the edge-function response is held open via a deferred
 * promise. The spec asserts:
 *
 *  In-flight:
 *   - the clicked button is disabled
 *   - a Loader2 spinner (svg.animate-spin) is inside the clicked button
 *   - every other action button is also disabled (shared `busy` lock)
 *
 *  After releasing a 200 success response:
 *   - the spinner disappears from the clicked button
 *   - every action button on the page re-enables
 *   - the correct success summary text renders with the payload values
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
  traceId: "trace-gate-sim-success",
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
  traceId: "trace-gate-apply-success",
  dryRun: false,
  applied: { rejects: 8, downranks: 12 },
};

const editorSimulatePayload = {
  ok: true,
  traceId: "trace-editor-sim-success",
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
  traceId: "trace-editor-apply-success",
  dryRun: false,
  summary: { ...editorSimulatePayload.summary, approved: 12, rejected: 4 },
};

function deferred<T>(): [Promise<T>, (v: T) => void] {
  let resolve!: (v: T) => void;
  const p = new Promise<T>((r) => (resolve = r));
  return [p, resolve];
}

async function seedAdmin(context: any, page: any) {
  await context.addInitScript(
    ([key, session]: [string, unknown]) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(session));
      } catch {}
    },
    [STORAGE_KEY, fakeSession],
  );
  await page.route(`**/${SUPABASE_HOST}/auth/v1/**`, async (route: any) => {
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
  await page.route(`**/${SUPABASE_HOST}/rest/v1/user_roles**`, (route: any) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ role: "admin" }),
    }),
  );
  await page.route(`**/${SUPABASE_HOST}/rest/v1/**`, (route: any) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/0" },
      body: JSON.stringify([]),
    }),
  );
}

type Action = {
  name: string;
  fnPath: "pinterest-native-prepublish-gate" | "pinterest-editor-in-chief";
  payload: unknown;
  button: (page: any) => any;
  /** Locators / regexes that MUST appear after success. */
  expectSuccess: (page: any) => Promise<void>;
};

const ACTIONS: Action[] = [
  {
    name: "Gate Simulate",
    fnPath: "pinterest-native-prepublish-gate",
    payload: gateSimulatePayload,
    button: (page) =>
      page.getByRole("button", { name: /Simulate \(dry-run\)/i }).first(),
    expectSuccess: async (page) => {
      await expect(page.getByText(/Avg native score/i)).toBeVisible();
      await expect(page.getByText("47")).toBeVisible();
      await expect(page.getByText(/Planned reject: 8/)).toBeVisible();
    },
  },
  {
    name: "Gate Apply",
    fnPath: "pinterest-native-prepublish-gate",
    payload: gateApplyPayload,
    button: (page) => page.getByRole("button", { name: /Apply rebalance/i }),
    expectSuccess: async (page) => {
      await expect(
        page.getByText(/Applied: 8 rejected, 12 downranked/i),
      ).toBeVisible();
    },
  },
  {
    name: "Editor Simulate",
    fnPath: "pinterest-editor-in-chief",
    payload: editorSimulatePayload,
    button: (page) =>
      page.getByRole("button", { name: /Simulate \(dry-run\)/i }).nth(1),
    expectSuccess: async (page) => {
      await expect(page.getByText(/Evaluated:/i)).toBeVisible();
      await expect(page.getByText(/Improved \(auto\):/i)).toBeVisible();
      await expect(page.getByText(/across 7 iterations/i)).toBeVisible();
    },
  },
  {
    name: "Editor Apply",
    fnPath: "pinterest-editor-in-chief",
    payload: editorApplyPayload,
    button: (page) =>
      page.getByRole("button", { name: /Run editor on next 25 drafts/i }),
    expectSuccess: async (page) => {
      await expect(page.getByText(/Approved:/i)).toBeVisible();
      await expect(page.getByText(/Rejected:/i)).toBeVisible();
    },
  },
];

const SIBLING_NAMES = [
  /Simulate \(dry-run\)/i,
  /Apply rebalance/i,
  /Run editor on next 25 drafts/i,
];

test.describe("Admin · Pinterest Quality · success-path loading recovery", () => {
  for (const action of ACTIONS) {
    test(`${action.name}: spinner clears, all buttons re-enable, summary renders after 200`, async ({
      context,
      page,
    }) => {
      await seedAdmin(context, page);

      const [hold, release] = deferred<void>();
      await page.route(
        `**/${SUPABASE_HOST}/functions/v1/${action.fnPath}`,
        async (route) => {
          await hold;
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(action.payload),
          });
        },
      );

      await page.goto("/admin/pinterest-quality");

      const btn = action.button(page);
      await expect(btn).toBeEnabled();

      const reqPromise = page.waitForRequest(
        `**/${SUPABASE_HOST}/functions/v1/${action.fnPath}`,
      );
      await btn.click();
      await reqPromise;

      // In-flight: button disabled + spinner present + siblings disabled.
      await expect(btn).toBeDisabled();
      await expect(btn.locator("svg.animate-spin")).toHaveCount(1);
      for (const n of SIBLING_NAMES) {
        const all = page.getByRole("button", { name: n });
        const count = await all.count();
        for (let i = 0; i < count; i++) {
          await expect(all.nth(i)).toBeDisabled();
        }
      }

      // Release with the success payload.
      release();

      // Success summary appears.
      await action.expectSuccess(page);

      // Spinner gone from the clicked button.
      await expect(btn.locator("svg.animate-spin")).toHaveCount(0);

      // Every action button is enabled again.
      for (const n of SIBLING_NAMES) {
        const all = page.getByRole("button", { name: n });
        const count = await all.count();
        for (let i = 0; i < count; i++) {
          await expect(all.nth(i)).toBeEnabled();
        }
      }

      // No global error toast leaked through.
      await expect(page.getByText(/Gate failed:/i)).toHaveCount(0);
      await expect(page.getByText(/Editor failed:/i)).toHaveCount(0);
    });
  }
});

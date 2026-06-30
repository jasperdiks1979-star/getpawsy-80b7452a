import { test, expect } from "../playwright-fixture";

/**
 * In-flight loading-state coverage for the admin Pinterest Quality flow.
 *
 * For both gates × Simulate/Apply, the edge-function response is held open
 * until the test releases it. While the request is in flight the test
 * asserts:
 *  - the clicked button is disabled
 *  - the sibling action buttons on the page are also disabled (the page
 *    uses a single `busy` lock)
 *  - a Loader2 spinner (svg.animate-spin) is rendered inside the clicked
 *    button
 * After the deferred response resolves with a 500, the test asserts the
 * error toast is shown and every action button is re-enabled.
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

/** Returns a [promise, resolve] pair used to hold an edge-function call open. */
function deferred<T>(): [Promise<T>, (v: T) => void] {
  let resolve!: (v: T) => void;
  const p = new Promise<T>((r) => (resolve = r));
  return [p, resolve];
}

async function seedAdminSession(context: any, page: any) {
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
  fnPath: string;
  failToastRegex: RegExp;
  /** Returns the locator for the button under test. */
  button: (page: any) => any;
};

const ACTIONS: Action[] = [
  {
    name: "Pre-publish gate Simulate (dry-run)",
    fnPath: "pinterest-native-prepublish-gate",
    failToastRegex: /Gate failed:/i,
    button: (page) =>
      page.getByRole("button", { name: /Simulate \(dry-run\)/i }).first(),
  },
  {
    name: "Pre-publish gate Apply rebalance",
    fnPath: "pinterest-native-prepublish-gate",
    failToastRegex: /Gate failed:/i,
    button: (page) => page.getByRole("button", { name: /Apply rebalance/i }),
  },
  {
    name: "Editor-in-Chief Simulate (dry-run)",
    fnPath: "pinterest-editor-in-chief",
    failToastRegex: /Editor failed:/i,
    button: (page) =>
      page.getByRole("button", { name: /Simulate \(dry-run\)/i }).nth(1),
  },
  {
    name: "Editor-in-Chief Run editor on next 25 drafts",
    fnPath: "pinterest-editor-in-chief",
    failToastRegex: /Editor failed:/i,
    button: (page) =>
      page.getByRole("button", { name: /Run editor on next 25 drafts/i }),
  },
];

test.describe("Admin · Pinterest Quality · loading-state + recovery", () => {
  for (const action of ACTIONS) {
    test(`${action.name}: button disables + shows spinner during flight, re-enables after error`, async ({
      context,
      page,
    }) => {
      await seedAdminSession(context, page);

      const [hold, release] = deferred<void>();
      await page.route(
        `**/${SUPABASE_HOST}/functions/v1/${action.fnPath}`,
        async (route) => {
          await hold;
          return route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "boom" }),
          });
        },
      );

      await page.goto("/admin/pinterest-quality");

      const btn = action.button(page);
      await expect(btn).toBeEnabled();

      // Trigger and wait for the request to actually leave the browser so the
      // React state has transitioned to `busy`.
      const requestPromise = page.waitForRequest(
        `**/${SUPABASE_HOST}/functions/v1/${action.fnPath}`,
      );
      await btn.click();
      await requestPromise;

      // In-flight assertions.
      await expect(btn).toBeDisabled();
      // Spinner is rendered inside the active button.
      await expect(btn.locator("svg.animate-spin")).toHaveCount(1);
      // Every other action button on the page should also be disabled — the
      // page enforces a single in-flight action via the shared `busy` lock.
      const siblingNames = [
        /Simulate \(dry-run\)/i,
        /Apply rebalance/i,
        /Run editor on next 25 drafts/i,
      ];
      for (const n of siblingNames) {
        const all = page.getByRole("button", { name: n });
        const count = await all.count();
        for (let i = 0; i < count; i++) {
          await expect(all.nth(i)).toBeDisabled();
        }
      }

      // Release the response → page processes the 500.
      release();

      // Error toast appears.
      await expect(page.getByText(action.failToastRegex).first()).toBeVisible();

      // All action buttons re-enabled, spinner removed.
      for (const n of siblingNames) {
        const all = page.getByRole("button", { name: n });
        const count = await all.count();
        for (let i = 0; i < count; i++) {
          await expect(all.nth(i)).toBeEnabled();
        }
      }
      await expect(btn.locator("svg.animate-spin")).toHaveCount(0);
    });
  }
});

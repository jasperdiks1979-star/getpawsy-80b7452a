import { test, expect } from "../playwright-fixture";

/**
 * Status → toast/UI mapping coverage for the admin Pinterest Quality page.
 *
 * For every status in {400, 401, 429, 500, 503} and every action
 * (gate Simulate, gate Apply, editor Simulate, editor Apply) the spec
 * asserts:
 *  - Toast prefix:  "Gate failed:"   for the pre-publish gate
 *                   "Editor failed:" for the Editor-in-Chief
 *  - Toast body contains the supabase-js HTTP error message
 *    ("Edge Function returned a non-2xx status code"). The page surfaces
 *    `(e as Error).message`, and supabase-js maps every non-2xx response to
 *    this canonical message — so the "correct" mapping for every status in
 *    this set is the same generic message + a per-action prefix. This test
 *    locks that contract in.
 *  - No success summary is rendered.
 *  - The clicked button is re-enabled (state recovers).
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

const STATUSES = [400, 401, 429, 500, 503] as const;

type Action = {
  name: string;
  fnPath: "pinterest-native-prepublish-gate" | "pinterest-editor-in-chief";
  toastPrefix: "Gate failed:" | "Editor failed:";
  successSummaryRegex: RegExp;
  button: (page: any) => any;
};

const ACTIONS: Action[] = [
  {
    name: "Gate Simulate",
    fnPath: "pinterest-native-prepublish-gate",
    toastPrefix: "Gate failed:",
    successSummaryRegex: /Avg native score/i,
    button: (page) =>
      page.getByRole("button", { name: /Simulate \(dry-run\)/i }).first(),
  },
  {
    name: "Gate Apply",
    fnPath: "pinterest-native-prepublish-gate",
    toastPrefix: "Gate failed:",
    successSummaryRegex: /Applied:.*rejected.*downranked/i,
    button: (page) => page.getByRole("button", { name: /Apply rebalance/i }),
  },
  {
    name: "Editor Simulate",
    fnPath: "pinterest-editor-in-chief",
    toastPrefix: "Editor failed:",
    successSummaryRegex: /Evaluated:/i,
    button: (page) =>
      page.getByRole("button", { name: /Simulate \(dry-run\)/i }).nth(1),
  },
  {
    name: "Editor Apply",
    fnPath: "pinterest-editor-in-chief",
    toastPrefix: "Editor failed:",
    successSummaryRegex: /Approved:/i,
    button: (page) =>
      page.getByRole("button", { name: /Run editor on next 25 drafts/i }),
  },
];

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

test.describe("Admin · Pinterest Quality · HTTP status → toast/UI mapping", () => {
  for (const action of ACTIONS) {
    for (const status of STATUSES) {
      test(`${action.name} HTTP ${status} → toast "${action.toastPrefix} ..." + no summary + button recovers`, async ({
        context,
        page,
      }) => {
        await seedAdmin(context, page);

        await page.route(
          `**/${SUPABASE_HOST}/functions/v1/${action.fnPath}`,
          (route) =>
            route.fulfill({
              status,
              contentType: "application/json",
              body: JSON.stringify({ error: `simulated ${status}` }),
            }),
        );

        await page.goto("/admin/pinterest-quality");

        const btn = action.button(page);
        await expect(btn).toBeEnabled();
        await btn.click();

        // Toast: prefix + supabase-js canonical non-2xx message.
        const toast = page
          .getByText(
            new RegExp(
              `${action.toastPrefix}.*(Edge Function returned a non-2xx status code|non-2xx|FunctionsHttpError)`,
              "i",
            ),
          )
          .first();
        await expect(toast).toBeVisible();

        // No success summary text appears.
        await expect(page.getByText(action.successSummaryRegex)).toHaveCount(0);

        // Button recovered.
        await expect(btn).toBeEnabled();
      });
    }
  }
});

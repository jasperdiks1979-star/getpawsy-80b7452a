import { test as base, expect } from "@playwright/test";

/**
 * Mark every browser context using the shared E2E fixture before app scripts.
 * This is a tab-scoped analytics isolation marker, not a bot heuristic.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      sessionStorage.setItem("gp_synthetic_traffic_v1", "playwright-e2e");
    });
    await use(context);
  },
});

export { expect };

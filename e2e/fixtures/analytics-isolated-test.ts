import { test as base, expect } from '@playwright/test';

/**
 * Opt-in fixture for live-shop browser tests.
 * Installs before the first navigation so the existing founder-mode guard
 * classifies test traffic as internal rather than a real customer.
 *
 * IMPORTANT: Import { test, expect } from this module in live E2E specs.
 * This does not authenticate as a founder or change checkout behavior.
 * Backend ingestion and third-party pixels need separate verification.
 */
export const test = base.extend<{ _analyticsIsolation: void }>({
  _analyticsIsolation: [
    async ({ context }, use) => {
      await context.addInitScript(() => {
        try {
          window.localStorage.setItem('gp_founder', '1');
        } catch {
          // Storage can be unavailable on about:blank; it is retried on navigation.
        }
      });
      await use();
    },
    { auto: true },
  ],
});

export { expect };

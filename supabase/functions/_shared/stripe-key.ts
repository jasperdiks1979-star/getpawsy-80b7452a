/**
 * Canonical Stripe key selection shared by every server function that talks
 * to Stripe (checkout, Klarna eligibility, webhook, ...).
 *
 * Rules (single source of truth):
 *   - STRIPE_MODE=live  -> force STRIPE_SECRET_KEY_LIVE
 *   - STRIPE_MODE=test  -> force STRIPE_SECRET_KEY
 *   - otherwise         -> prefer STRIPE_SECRET_KEY_LIVE, fall back to STRIPE_SECRET_KEY
 *
 * Only the resolved MODE ("live" | "test" | "unknown") may be logged.
 * The key itself must never be logged or returned to a client.
 */

export type StripeMode = "live" | "test" | "unknown";

export interface StripeKeyEnv {
  STRIPE_SECRET_KEY_LIVE?: string | null;
  STRIPE_SECRET_KEY?: string | null;
  STRIPE_MODE?: string | null;
}

export interface StripeKeySelection {
  key: string | null;
  mode: StripeMode;
  /** Which env var supplied the key. */
  source: "live_env" | "test_env" | "none";
  /** Forced mode, if STRIPE_MODE was set to a recognised value. */
  override: "live" | "test" | null;
}

function modeOf(key: string | null): StripeMode {
  if (!key) return "unknown";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  return "unknown";
}

function clean(value: string | null | undefined): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  return v.length > 0 ? v : null;
}

export function selectStripeKey(env: StripeKeyEnv): StripeKeySelection {
  const liveKey = clean(env.STRIPE_SECRET_KEY_LIVE);
  const testKey = clean(env.STRIPE_SECRET_KEY);
  const raw = (clean(env.STRIPE_MODE) || "").toLowerCase();
  const override = raw === "live" ? "live" : raw === "test" ? "test" : null;

  let key: string | null;
  let source: StripeKeySelection["source"];
  if (override === "test") {
    key = testKey;
    source = testKey ? "test_env" : "none";
  } else if (override === "live") {
    key = liveKey;
    source = liveKey ? "live_env" : "none";
  } else if (liveKey) {
    key = liveKey;
    source = "live_env";
  } else {
    key = testKey;
    source = testKey ? "test_env" : "none";
  }

  return { key, mode: modeOf(key), source, override };
}

/** Reads the current runtime environment (Deno) and applies the same rules. */
export function getStripeKey(): StripeKeySelection {
  const denoEnv = (globalThis as { Deno?: { env?: { get(name: string): string | undefined } } }).Deno
    ?.env;
  const read = (name: string) => (denoEnv ? denoEnv.get(name) ?? null : null);
  return selectStripeKey({
    STRIPE_SECRET_KEY_LIVE: read("STRIPE_SECRET_KEY_LIVE"),
    STRIPE_SECRET_KEY: read("STRIPE_SECRET_KEY"),
    STRIPE_MODE: read("STRIPE_MODE"),
  });
}

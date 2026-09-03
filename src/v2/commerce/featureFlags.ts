/**
 * Single V2 feature-flag surface. Default is ALWAYS false.
 *
 * There are two independent flags and they are never interchangeable:
 *
 *  - `VITE_COMMERCE_V2` — BROWSER flag. It only decides what the UI *builds and
 *    sends*. It is attacker-controlled in practice and NEVER authorizes any
 *    server behaviour.
 *  - `COMMERCE_V2_ENABLED` — SERVER/EDGE flag. Only this may enable the V2
 *    server checkout path. The server must re-check it for every request and
 *    must ignore anything the client asserts about V2 being enabled.
 */

export const V2_UI_FLAG_KEY = "VITE_COMMERCE_V2" as const;
export const V2_SERVER_FLAG_KEY = "COMMERCE_V2_ENABLED" as const;

const TRUE_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", "disabled", ""]);

/** Strict parser: anything unrecognised, missing or non-string is false. */
export function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return false; // unknown/invalid => fail closed
}

export type EnvLike = Readonly<Record<string, unknown>> | undefined | null;

/** Browser flag. Presentation/request-shape only. */
export function isCommerceV2UiEnabled(env: EnvLike): boolean {
  return parseBooleanFlag(env?.[V2_UI_FLAG_KEY]);
}

/**
 * Server flag. The ONLY thing that may authorize the V2 server checkout path.
 * A client-side claim is explicitly ignored: this function never reads
 * `VITE_COMMERCE_V2`.
 */
export function isCommerceV2ServerEnabled(env: EnvLike): boolean {
  return parseBooleanFlag(env?.[V2_SERVER_FLAG_KEY]);
}

/** Convenience for browser code; safe during SSR. */
export function commerceV2UiEnabled(): boolean {
  try {
    const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
    return isCommerceV2UiEnabled(env ?? null);
  } catch {
    return false;
  }
}

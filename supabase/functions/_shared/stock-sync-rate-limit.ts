/** CJ throttling must stop the current batch without consuming its checkpoint.
 * The independent watchdog handles bounded, delayed retries at the same offset.
 */
export class CJRateLimitError extends Error {
  constructor() {
    super("CJ inventory rate limited (429); batch checkpoint unchanged");
    this.name = "CJRateLimitError";
  }
}

export function isCJRateLimited(httpStatus: number, responseCode?: unknown): boolean {
  return httpStatus === 429 || responseCode === 429 || responseCode === "429";
}

/** A CJ authentication failure or temporary upstream outage is NOT a verified
 * inventory observation. Leave the saved offset untouched for bounded recovery.
 */
export class CJUnverifiedInventoryError extends Error {
  constructor(public readonly httpStatus: number) {
    super(`CJ inventory unavailable (HTTP ${httpStatus}); batch checkpoint unchanged`);
    this.name = "CJUnverifiedInventoryError";
  }
}

export function isCJUnverifiedInventoryStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 408 ||
    status === 425 || (status >= 500 && status <= 599);
}

/** A rejected fetch is an unverified supplier observation regardless of the
 * runtime-specific network error message (e.g. Deno's 'error sending request').
 * Preserve the checkpoint after bounded immediate transport retries.
 */
export class CJTransportError extends Error {
  constructor() {
    super("CJ inventory transport failed; batch checkpoint unchanged");
    this.name = "CJTransportError";
  }
}

export async function fetchCJInventoryResponse(request: () => Promise<Response>): Promise<Response> {
  try {
    return await request();
  } catch {
    // Do not depend on platform-specific TypeError messages for retry policy.
    throw new CJTransportError();
  }
}

/** An absent, malformed or negative CJ quantity is not a verified zero.
 * A literal zero must NOT fall back to cjInventoryNum via JavaScript ||.
 */
export class CJUnverifiedInventoryQuantityError extends Error {
  constructor() {
    super("CJ inventory quantity missing or invalid; batch checkpoint unchanged");
    this.name = "CJUnverifiedInventoryQuantityError";
  }
}

export function readCJStockQuantity(totalInventoryNum: unknown, cjInventoryNum: unknown): number {
  const raw = totalInventoryNum ?? cjInventoryNum;
  const quantity = typeof raw === "number" ? raw
    : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new CJUnverifiedInventoryQuantityError();
  }
  return quantity;
}

export function mustHaltStockBatch(error: unknown): boolean {
  return error instanceof CJRateLimitError ||
    error instanceof CJUnverifiedInventoryError ||
    error instanceof CJUnverifiedInventoryQuantityError ||
    error instanceof CJTransportError;
}

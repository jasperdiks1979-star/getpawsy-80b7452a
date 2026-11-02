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

export function mustHaltStockBatch(error: unknown): boolean {
  return error instanceof CJRateLimitError || error instanceof CJUnverifiedInventoryError;
}

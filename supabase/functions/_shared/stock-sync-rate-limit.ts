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

export function mustHaltStockBatch(error: unknown): error is CJRateLimitError {
  return error instanceof CJRateLimitError;
}

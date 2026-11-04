import { CJRateLimitError, isCJRateLimited, mustHaltStockBatch } from "./stock-sync-rate-limit.ts";

Deno.test("CJ throttling is recognized in HTTP status or CJ payload", () => {
  for (const [status, code] of [[429, undefined], [200, 429], [200, "429"]] as const) {
    if (!isCJRateLimited(status, code)) throw new Error("Missed CJ rate limit");
  }
  for (const [status, code] of [[200, 200], [503, undefined], [200, "200"]] as const) {
    if (isCJRateLimited(status, code)) throw new Error("False CJ rate limit");
  }
});

Deno.test("rate limits abort the batch instead of consuming its saved offset", () => {
  const throttled = new CJRateLimitError();
  if (!mustHaltStockBatch(throttled)) throw new Error("Rate limit must stop the batch");
  if (mustHaltStockBatch(new Error("Network timeout"))) throw new Error("Non-throttle error misclassified");
  if (throttled.name !== "CJRateLimitError") throw new Error("Missing stable error identity");
});

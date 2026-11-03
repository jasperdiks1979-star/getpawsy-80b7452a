import { CJRateLimitError, CJTransportError, CJUnverifiedInventoryError, fetchCJInventoryResponse, isCJRateLimited, isCJUnverifiedInventoryStatus, mustHaltStockBatch } from "./stock-sync-rate-limit.ts";

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

Deno.test("CJ auth and upstream outages preserve the checkpoint for bounded recovery", () => {
  for (const status of [401, 403, 408, 425, 500, 502, 503, 504, 599]) {
    if (!isCJUnverifiedInventoryStatus(status)) throw new Error(`Missed unverified CJ status ${status}`);
    if (!mustHaltStockBatch(new CJUnverifiedInventoryError(status))) {
      throw new Error(`CJ ${status} must stop batch before checkpoint advancement`);
    }
  }
  // CJ also returns numeric error codes encoded as JSON strings on HTTP 200.
  for (const code of ["401", "503", "504"]) {
    if (!isCJUnverifiedInventoryStatus(Number(code))) {
      throw new Error(`Missed CJ payload code ${code}`);
    }
  }
  for (const status of [200, 201, 400, 404, 409, 429]) {
    if (isCJUnverifiedInventoryStatus(status)) throw new Error(`False unverified status ${status}`);
  }
});

Deno.test("rejected CJ fetch is checkpoint-preserving regardless of runtime error text", async () => {
  for (const reason of [
    new TypeError("error sending request for url"),
    new TypeError("connection reset by peer"),
    new Error("TLS handshake failed"),
  ]) {
    let caught: unknown;
    try {
      await fetchCJInventoryResponse(async () => { throw reason; });
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof CJTransportError) || !mustHaltStockBatch(caught)) {
      throw new Error("CJ transport rejection must stop batch before checkpoint advancement");
    }
  }
});

Deno.test("successful CJ fetch response remains unchanged", async () => {
  const response = new Response('{"result":true}', { status: 200 });
  const returned = await fetchCJInventoryResponse(async () => response);
  if (returned !== response) throw new Error("Successful CJ response unexpectedly modified");
});

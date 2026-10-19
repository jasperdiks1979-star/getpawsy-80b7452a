import { describe, expect, it } from "vitest";
import { resolveCheckoutReturnOrigin, LIVE_STORE_ORIGIN } from "../../supabase/functions/_shared/checkout-return-origin";

describe("Stripe return URLs: never trust live caller Origin/Referer", () => {
  it("uses GetPawsy canonical domain for real live checkout", () => {
    expect(resolveCheckoutReturnOrigin("live", "https://getpawsy.pet", null, null))
      .toBe(LIVE_STORE_ORIGIN);
    expect(resolveCheckoutReturnOrigin("live", null, null, null))
      .toBe(LIVE_STORE_ORIGIN);
  });
  it("ignores a localhost-origin live checkout, as observed in historical sessions", () => {
    expect(resolveCheckoutReturnOrigin("live", "http://localhost:8080", null, null))
      .toBe(LIVE_STORE_ORIGIN);
  });
  it("ignores attacker-selected live return domains", () => {
    expect(resolveCheckoutReturnOrigin("live", "https://fake-payments.example", "https://fake-payments.example/checkout", "https://getpawsy.pet"))
      .toBe(LIVE_STORE_ORIGIN);
    expect(resolveCheckoutReturnOrigin("live", null, "javascript:alert(1)", "https://fake-payments.example"))
      .toBe(LIVE_STORE_ORIGIN);
  });
  it("fails closed if Stripe mode is unrecognized", () => {
    expect(resolveCheckoutReturnOrigin("", "https://fake-payments.example", null, null))
      .toBe(LIVE_STORE_ORIGIN);
  });
  it("preserves localhost and https preview support for test-mode checkout", () => {
    expect(resolveCheckoutReturnOrigin("test", "http://localhost:8080", null, null))
      .toBe("http://localhost:8080");
    expect(resolveCheckoutReturnOrigin("test", "https://id-preview--safe-copy.lovable.app/checkout", null, null))
      .toBe("https://id-preview--safe-copy.lovable.app");
  });
  it("rejects non-HTTP protocols and invalid URLs in test mode", () => {
    expect(resolveCheckoutReturnOrigin("test", "javascript:alert(1)", "http://127.0.0.1:3000/checkout", null))
      .toBe("http://127.0.0.1:3000");
    expect(resolveCheckoutReturnOrigin("test", "data:text/plain,unsafe", null, null))
      .toBe(LIVE_STORE_ORIGIN);
  });
});

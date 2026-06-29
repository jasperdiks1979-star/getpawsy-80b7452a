import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Runtime regression test for rapid double-taps on Add To Cart.
 *
 * Production contract (verified 2026-06-29 on real sessions):
 *  - One tap        -> exactly one `add_to_cart_click` row emitted by trackCci
 *  - Two rapid taps -> exactly two `add_to_cart_click` rows (no client dedup
 *                      that would silently swallow legitimate user intent)
 *  - `add_to_cart_success` emission count must be unchanged by any future
 *                      click-side dedup work.
 *
 * This complements the static guard in
 *   src/pages/__tests__/ProductDetail.atc-dedup.test.ts
 * (which asserts handleAddToCart only calls trackCci('add_to_cart_click', …)
 * once per invocation), by also asserting that the trackCci transport itself
 * does not coalesce or debounce rapid emissions.
 */

// trackCci reads VITE_SUPABASE_PROJECT_ID via import.meta.env at module eval
// time, so we must stub it BEFORE importing the module under test.
vi.stubEnv("VITE_SUPABASE_PROJECT_ID", "test-project");

let sendBeaconSpy: ReturnType<typeof vi.fn>;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  sessionStorage.clear();
  localStorage.clear();

  sendBeaconSpy = vi.fn(() => true);
  fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));

  Object.defineProperty(window.navigator, "sendBeacon", {
    configurable: true,
    value: sendBeaconSpy,
  });
  vi.stubGlobal("fetch", fetchSpy);
});

const fireRapidly = async (
  trackCci: typeof import("@/lib/cci").trackCci,
  event: "add_to_cart_click" | "add_to_cart_success",
  taps: number,
  gapMs = 50,
) => {
  for (let i = 0; i < taps; i++) {
    trackCci(event, { product_id: "p_test", tap_index: i });
    if (i < taps - 1) await new Promise((r) => setTimeout(r, gapMs));
  }
};

const callsFor = (event: string) =>
  sendBeaconSpy.mock.calls.filter(([, blob]) => {
    try {
      // blob is a Blob built from JSON.stringify(body)
      // We rely on async text() being available in jsdom Blob.
      return (blob as Blob & { _cachedText?: string });
    } catch {
      return false;
    }
  });

const decodeBeaconBodies = async (): Promise<Array<Record<string, unknown>>> => {
  const bodies: Array<Record<string, unknown>> = [];
  for (const call of sendBeaconSpy.mock.calls) {
    const blob = call[1] as Blob;
    // jsdom's Blob lacks .text(); read via Response which wraps the blob stream.
    const text = await new Response(blob).text();
    bodies.push(JSON.parse(text) as Record<string, unknown>);
  }
  return bodies;
};

describe("trackCci — rapid double-tap dedup contract", () => {
  it("emits exactly one beacon per add_to_cart_click tap (no client coalescing)", async () => {
    const { trackCci } = await import("@/lib/cci");
    await fireRapidly(trackCci, "add_to_cart_click", 2, 50);

    expect(sendBeaconSpy).toHaveBeenCalledTimes(2);

    const bodies = await decodeBeaconBodies();
    const clicks = bodies.filter((b) => b.event_name === "add_to_cart_click");
    expect(clicks).toHaveLength(2);
    expect(clicks.map((c) => c.tap_index)).toEqual([0, 1]);
    // Both taps must share the same session id (so monitoring can detect
    // duplicate-pair regressions per session if the contract ever breaks).
    expect(clicks[0].session_id).toBeTruthy();
    expect(clicks[0].session_id).toBe(clicks[1].session_id);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("scales linearly: N rapid taps -> N click beacons", async () => {
    const { trackCci } = await import("@/lib/cci");
    await fireRapidly(trackCci, "add_to_cart_click", 5, 20);
    expect(sendBeaconSpy).toHaveBeenCalledTimes(5);
  });

  it("leaves add_to_cart_success untouched: N rapid taps -> N success beacons", async () => {
    const { trackCci } = await import("@/lib/cci");
    await fireRapidly(trackCci, "add_to_cart_success", 3, 30);

    expect(sendBeaconSpy).toHaveBeenCalledTimes(3);
    const bodies = await decodeBeaconBodies();
    const successes = bodies.filter((b) => b.event_name === "add_to_cart_success");
    expect(successes).toHaveLength(3);
  });

  it("falls back to fetch when sendBeacon is unavailable, still 1-per-tap", async () => {
    Object.defineProperty(window.navigator, "sendBeacon", {
      configurable: true,
      value: undefined,
    });
    const { trackCci } = await import("@/lib/cci");
    await fireRapidly(trackCci, "add_to_cart_click", 2, 25);

    expect(sendBeaconSpy).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

// Silence the unused helper warning if tree-shaken in future edits.
void callsFor;
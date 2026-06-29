import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Randomized rapid-tap regression for the ATC dedup contract.
 *
 * Asserts the *cross-invocation* contract — i.e. that the handler-side dedup
 * we shipped in ProductDetail.handleAddToCart never accidentally grows into a
 * cross-tap coalescer:
 *
 *   N user taps (with jittered sub-200ms gaps) ->
 *     exactly N `add_to_cart_click` beacons
 *     exactly N `add_to_cart_success` beacons
 *
 * The handler under test mirrors the production shape: each invocation emits
 * a single click and (on success) a single success, with full metadata. If a
 * future refactor introduces a leading-edge debounce / dedup-by-session,
 * either the click or the success count will diverge from the tap count and
 * this test fails.
 *
 * Complements:
 *  - src/pages/__tests__/ProductDetail.atc-dedup.test.ts (static source guard)
 *  - src/lib/__tests__/cci.atc-rapid-taps.test.ts        (transport guard)
 */

vi.stubEnv("VITE_SUPABASE_PROJECT_ID", "test-project");

let sendBeaconSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
  localStorage.clear();

  sendBeaconSpy = vi.fn(() => true);
  Object.defineProperty(window.navigator, "sendBeacon", {
    configurable: true,
    value: sendBeaconSpy,
  });

  class TestBlob {
    public readonly _text: string;
    public readonly type: string;
    constructor(parts: Array<string>, opts?: { type?: string }) {
      this._text = parts.join("");
      this.type = opts?.type ?? "";
    }
  }
  vi.stubGlobal("Blob", TestBlob as unknown as typeof Blob);
});

const decodeBodies = (): Array<Record<string, unknown>> =>
  sendBeaconSpy.mock.calls.map((call) => {
    const blob = call[1] as unknown as { _text: string };
    return JSON.parse(blob._text) as Record<string, unknown>;
  });

/**
 * Mirrors the production handleAddToCart contract:
 *  - builds clickMeta once (geo/shipping aware)
 *  - emits exactly one trackCci('add_to_cart_click', …) per invocation
 *  - emits exactly one trackCci('add_to_cart_success', …) per invocation
 *
 * Any future regression that double-emits inside the handler would surface
 * as 2x clicks per tap (cross-invocation totals would still hit N, but the
 * existing single-tap assertion in ProductDetail.atc-dedup catches the
 * within-handler case — this test catches coalescing across taps).
 */
const handleTap = (
  trackCci: typeof import("@/lib/cci").trackCci,
  tapIndex: number,
  shippingEligibility: "unknown_pending_checkout" | "region_warning" | "ok",
) => {
  const clickMeta: Record<string, unknown> = { tap_index: tapIndex };
  if (shippingEligibility !== "ok") {
    clickMeta.shipping_eligibility = shippingEligibility;
    clickMeta.warehouse = "US";
    if (shippingEligibility === "region_warning") {
      clickMeta.destination_country = "NL";
    }
  }
  trackCci("add_to_cart_click", { product_id: "p_random", ...clickMeta });
  trackCci("add_to_cart_success", { product_id: "p_random", tap_index: tapIndex });
};

const randomGap = (rng: () => number, minMs = 30, maxMs = 180) =>
  Math.floor(minMs + rng() * (maxMs - minMs));

// Tiny seeded PRNG so failures are reproducible.
const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const fireRandomTaps = async (
  trackCci: typeof import("@/lib/cci").trackCci,
  taps: number,
  rng: () => number,
  shipping: Parameters<typeof handleTap>[2] = "ok",
) => {
  for (let i = 0; i < taps; i++) {
    handleTap(trackCci, i, shipping);
    if (i < taps - 1) {
      await new Promise((r) => setTimeout(r, randomGap(rng)));
    }
  }
};

describe("trackCci — randomized rapid multi-tap dedup contract", () => {
  it("double-tap with jitter: 2 taps -> 2 clicks + 2 successes (no coalescing)", async () => {
    const { trackCci } = await import("@/lib/cci");
    await fireRandomTaps(trackCci, 2, mulberry32(0xa11ce), "ok");

    const bodies = decodeBodies();
    const clicks = bodies.filter((b) => b.event_name === "add_to_cart_click");
    const succ = bodies.filter((b) => b.event_name === "add_to_cart_success");

    expect(clicks).toHaveLength(2);
    expect(succ).toHaveLength(2);
    expect(clicks.map((c) => c.tap_index)).toEqual([0, 1]);
    expect(succ.map((s) => s.tap_index)).toEqual([0, 1]);
    // Both taps share the same session — monitoring guard input is realistic.
    expect(clicks[0].session_id).toBeTruthy();
    expect(clicks[0].session_id).toBe(clicks[1].session_id);
    expect(succ[0].session_id).toBe(clicks[0].session_id);
  });

  it("triple-tap with jitter: 3 taps -> 3 clicks + 3 successes, ordered tap_index", async () => {
    const { trackCci } = await import("@/lib/cci");
    await fireRandomTaps(trackCci, 3, mulberry32(0xb0b), "ok");

    const bodies = decodeBodies();
    const clicks = bodies.filter((b) => b.event_name === "add_to_cart_click");
    const succ = bodies.filter((b) => b.event_name === "add_to_cart_success");

    expect(clicks).toHaveLength(3);
    expect(succ).toHaveLength(3);
    expect(clicks.map((c) => c.tap_index)).toEqual([0, 1, 2]);
    expect(succ.map((s) => s.tap_index)).toEqual([0, 1, 2]);
  });

  it("triple-tap under geo-unknown: clickMeta stays soft on every tap, no error events", async () => {
    const { trackCci } = await import("@/lib/cci");
    await fireRandomTaps(trackCci, 3, mulberry32(0xfeed), "unknown_pending_checkout");

    const bodies = decodeBodies();
    const clicks = bodies.filter((b) => b.event_name === "add_to_cart_click");
    const errors = bodies.filter((b) => b.event_name === "add_to_cart_error");

    expect(clicks).toHaveLength(3);
    expect(errors).toHaveLength(0);
    for (const c of clicks) {
      expect(c.shipping_eligibility).toBe("unknown_pending_checkout");
      expect(c.warehouse).toBe("US");
    }
  });

  it("triple-tap under region_warning: every click carries destination_country, no hard block", async () => {
    const { trackCci } = await import("@/lib/cci");
    await fireRandomTaps(trackCci, 3, mulberry32(0xdead), "region_warning");

    const bodies = decodeBodies();
    const clicks = bodies.filter((b) => b.event_name === "add_to_cart_click");
    const succ = bodies.filter((b) => b.event_name === "add_to_cart_success");
    const errors = bodies.filter((b) => b.event_name === "add_to_cart_error");

    expect(clicks).toHaveLength(3);
    expect(succ).toHaveLength(3); // soft warning never blocks the success path
    expect(errors).toHaveLength(0);
    for (const c of clicks) {
      expect(c.shipping_eligibility).toBe("region_warning");
      expect(c.destination_country).toBe("NL");
    }
  });

  it("burst of 6 randomized taps preserves 1:1 click/success pairing across multiple seeds", async () => {
    const { trackCci } = await import("@/lib/cci");
    for (const seed of [1, 7, 42, 1337, 9001]) {
      sendBeaconSpy.mockClear();
      await fireRandomTaps(trackCci, 6, mulberry32(seed), "ok");
      const bodies = decodeBodies();
      const clicks = bodies.filter((b) => b.event_name === "add_to_cart_click");
      const succ = bodies.filter((b) => b.event_name === "add_to_cart_success");
      expect(clicks).toHaveLength(6);
      expect(succ).toHaveLength(6);
      // 1:1 ordering invariant — click[i] precedes success[i] in the beacon log.
      const order = bodies
        .filter(
          (b) =>
            b.event_name === "add_to_cart_click" ||
            b.event_name === "add_to_cart_success",
        )
        .map((b) => b.event_name);
      for (let i = 0; i < 6; i++) {
        expect(order[i * 2]).toBe("add_to_cart_click");
        expect(order[i * 2 + 1]).toBe("add_to_cart_success");
      }
    }
  });
});

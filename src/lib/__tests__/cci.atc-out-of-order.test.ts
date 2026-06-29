import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Out-of-order regression test for the ATC dedup + pairing contract.
 *
 * Real-world sessions can emit `add_to_cart_success` before
 * `add_to_cart_click` lands on the wire (sendBeacon reordering, fetch
 * fallback retry, optimistic success). The dedup/pairing logic must not
 * double-count, drop events, or mis-pair regardless of arrival order.
 *
 * Contract verified here:
 *   - N taps -> exactly N click beacons AND N success beacons, any order
 *   - Every event shares the same session_id (so server pairing by
 *     session_id + nearest timestamp still works)
 *   - Client-side tap_index ordering is preserved per event_name
 */

vi.stubEnv("VITE_SUPABASE_PROJECT_ID", "test-project");

let sendBeaconSpy: ReturnType<typeof vi.fn>;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
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

const decode = (): Array<Record<string, unknown>> =>
  sendBeaconSpy.mock.calls.map(
    (c) => JSON.parse((c[1] as unknown as { _text: string })._text) as Record<string, unknown>,
  );

describe("trackCci — out-of-order success/click dedup + pairing", () => {
  it("success-before-click on a single tap still records 1 click + 1 success in the same session", async () => {
    const { trackCci } = await import("@/lib/cci");
    trackCci("add_to_cart_success", { product_id: "p_oo", tap_index: 0 });
    trackCci("add_to_cart_click", { product_id: "p_oo", tap_index: 0 });

    const bodies = decode();
    const clicks = bodies.filter((b) => b.event_name === "add_to_cart_click");
    const successes = bodies.filter((b) => b.event_name === "add_to_cart_success");

    expect(clicks).toHaveLength(1);
    expect(successes).toHaveLength(1);
    expect(clicks[0].session_id).toBe(successes[0].session_id);
    expect(bodies.map((b) => b.event_name)).toEqual([
      "add_to_cart_success",
      "add_to_cart_click",
    ]);
  });

  it("interleaved out-of-order taps still yield N clicks + N successes (no double counting)", async () => {
    const { trackCci } = await import("@/lib/cci");
    trackCci("add_to_cart_success", { product_id: "p_oo", tap_index: 0 });
    trackCci("add_to_cart_click", { product_id: "p_oo", tap_index: 0 });
    trackCci("add_to_cart_click", { product_id: "p_oo", tap_index: 1 });
    trackCci("add_to_cart_success", { product_id: "p_oo", tap_index: 1 });

    const bodies = decode();
    const clicks = bodies.filter((b) => b.event_name === "add_to_cart_click");
    const successes = bodies.filter((b) => b.event_name === "add_to_cart_success");

    expect(clicks).toHaveLength(2);
    expect(successes).toHaveLength(2);
    expect(clicks.map((c) => c.tap_index)).toEqual([0, 1]);
    expect(successes.map((s) => s.tap_index)).toEqual([0, 1]);
    const sids = new Set(bodies.map((b) => b.session_id));
    expect(sids.size).toBe(1);
  });

  it("fully reversed order (all successes before any clicks) still pairs 1:1", async () => {
    const { trackCci } = await import("@/lib/cci");
    for (let i = 0; i < 3; i++) {
      trackCci("add_to_cart_success", { product_id: "p_oo", tap_index: i });
    }
    for (let i = 0; i < 3; i++) {
      trackCci("add_to_cart_click", { product_id: "p_oo", tap_index: i });
    }

    const bodies = decode();
    expect(bodies.filter((b) => b.event_name === "add_to_cart_click")).toHaveLength(3);
    expect(bodies.filter((b) => b.event_name === "add_to_cart_success")).toHaveLength(3);
    expect(sendBeaconSpy).toHaveBeenCalledTimes(6);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

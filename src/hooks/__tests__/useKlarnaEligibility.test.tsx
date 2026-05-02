import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// Mock the supabase client BEFORE importing the hook.
const invokeMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: any[]) => invokeMock(...args) } },
}));

import { useKlarnaEligibility } from "@/hooks/useKlarnaEligibility";

/**
 * Mirrors the server-side rule in supabase/functions/check-klarna-eligibility:
 *   amount < 35  -> not eligible (amount_out_of_range)
 *   amount > 10000 -> not eligible (amount_out_of_range)
 *   else         -> eligible (assuming Klarna enabled on the account)
 */
function fakeInvoke(_name: string, opts: { body: { amount: number } }) {
  const a = opts.body.amount;
  if (a < 35 || a > 10000) {
    return Promise.resolve({
      data: { ok: true, eligible: false, reason: "amount_out_of_range" },
      error: null,
    });
  }
  return Promise.resolve({
    data: { ok: true, eligible: true, reason: "ok" },
    error: null,
  });
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(fakeInvoke);
  // Bust the in-module session cache between tests by tweaking the currency casing
  // (cache key includes currency); we still pass the same intent.
});

describe("Klarna eligibility — $35 banner threshold", () => {
  it("does NOT show the banner when total is $0", async () => {
    const { result } = renderHook(() =>
      useKlarnaEligibility(0, { country: "US", currency: "usd" }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eligible).toBe(false);
  });

  it("does NOT show the banner at $34.99 (just below threshold)", async () => {
    const { result } = renderHook(() =>
      useKlarnaEligibility(34.99, { country: "US", currency: "usd" }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eligible).toBe(false);
    expect(result.current.reason).toBe("amount_out_of_range");
  });

  it("SHOWS the banner exactly at $35 (threshold)", async () => {
    const { result } = renderHook(() =>
      useKlarnaEligibility(35, { country: "US", currency: "usd" }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eligible).toBe(true);
  });

  it("SHOWS the banner above $35 (e.g. $129.50)", async () => {
    const { result } = renderHook(() =>
      useKlarnaEligibility(129.5, { country: "US", currency: "usd" }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eligible).toBe(true);
  });

  it("hides the banner again when total drops back below $35", async () => {
    const { result, rerender } = renderHook(
      ({ amt }: { amt: number }) =>
        useKlarnaEligibility(amt, { country: "US", currency: "usd" }),
      { initialProps: { amt: 49.99 } },
    );
    await waitFor(() => expect(result.current.eligible).toBe(true));

    act(() => rerender({ amt: 19.99 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eligible).toBe(false);
  });

  it("does NOT show the banner above the $10,000 max", async () => {
    const { result } = renderHook(() =>
      useKlarnaEligibility(10001, { country: "US", currency: "usd" }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eligible).toBe(false);
  });
});

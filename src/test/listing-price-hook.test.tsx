import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { selectRelatedGuides } from "@/lib/related-guides";

const inMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ in: (...a: unknown[]) => inMock(...a) }) }) },
}));
import { useListingPrice } from "@/hooks/useListingPrice";

const wrap = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};
const ROWS: Record<string, unknown> = {
  rvs: { id: "rvs", price: 96.99, variants: [{ variantSellPrice: 97.95, variantCostPrice: 33 }, { variantSellPrice: 97.95, variantCostPrice: 33 }] },
  raw: { id: "raw", price: 158.99, variants: [{ variantSellPrice: 68.88 }] },
  oos: { id: "oos", price: 50, variants: [{ variantSellPrice: 30, variantCostPrice: 1, variantStock: 0 }, { variantSellPrice: 60, variantCostPrice: 1, variantStock: 4 }] },
};

beforeEach(() => {
  inMock.mockReset();
  inMock.mockImplementation(async (_c: string, ids: string[]) => ({ data: ids.map((i) => ROWS[i]).filter(Boolean), error: null }));
});

describe("useListingPrice", () => {
  it("shows 'loading' first, then the charged price; batches repeated cards into one request", async () => {
    const w = wrap();
    const a = renderHook(() => useListingPrice({ id: "rvs", price: 96.99 }), { wrapper: w });
    const b = renderHook(() => useListingPrice({ id: "raw", price: 158.99 }), { wrapper: w });
    const c = renderHook(() => useListingPrice({ id: "oos", price: 50 }), { wrapper: w });
    expect(a.result.current).toBe("loading");
    await waitFor(() => expect(a.result.current).not.toBe("loading"));
    await waitFor(() => expect(c.result.current).not.toBe("loading"));
    expect(a.result.current).toMatchObject({ price: 97.95 });
    expect(b.result.current).toMatchObject({ price: 158.99 }); // supplier cost w/o marker ignored
    expect(c.result.current).toMatchObject({ price: 60 }); // out-of-stock option never sets the price
    expect(inMock).toHaveBeenCalledTimes(1);
  });
  it("backend error falls back to null (base price), never stuck loading", async () => {
    inMock.mockImplementation(async () => { throw new Error("522"); });
    const { result } = renderHook(() => useListingPrice({ id: "rvs", price: 96.99 }), { wrapper: wrap() });
    await waitFor(() => expect(result.current).toBeNull());
  });
  it("uses loaded variants directly without a request", () => {
    const { result } = renderHook(() => useListingPrice({ id: "x", price: 10, variants: [] }), { wrapper: wrap() });
    expect(result.current).toMatchObject({ price: 10 });
    expect(inMock).not.toHaveBeenCalled();
  });
});

describe("selectRelatedGuides", () => {
  const guides = [
    { slug: "best-interactive-dog-toys", title: "Best Interactive Dog Toys", category: "Dog Toys", keywords: ["dog toys"] },
    { slug: "best-interactive-cat-toys-that-work", title: "Best Interactive Cat Toys", category: "Cat Toys", keywords: ["cat toys"] },
  ];
  it("cat toy page gets cat guides only", () => {
    expect(selectRelatedGuides(guides, "Cat Toys", "cat").map((g) => g.slug)).toEqual(["best-interactive-cat-toys-that-work"]);
  });
  it("dog toy page keeps dog guides", () => {
    expect(selectRelatedGuides(guides, "Dog Toys", "dog").map((g) => g.slug)).toEqual(["best-interactive-dog-toys"]);
  });
});

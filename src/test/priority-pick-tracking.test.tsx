import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

(globalThis as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
const trackEvent = vi.fn();
vi.mock("@/lib/analytics", () => ({ trackEvent: (...a: unknown[]) => trackEvent(...a) }));
const calls: string[] = [];
vi.mock("@/integrations/supabase/client", () => {
  const product = { id: "p1", name: "Sisal Scratching Post", slug: "sisal-post", image_url: "https://x/i.png", price: 19.5, category: "Cat Scratching Posts", stock: 5 };
  const q: any = {
    select: () => q, order: () => q, limit: () => q, ilike: () => q, in: () => q, lte: () => q, or: () => q, not: () => q,
    eq: (c: string, v: unknown) => { calls.push(`eq:${c}=${v}`); return q; },
    gt: (c: string, v: unknown) => { calls.push(`gt:${c}=${v}`); return q; },
    then: (res: any) => Promise.resolve({ data: [product], error: null }).then(res),
    maybeSingle: () => Promise.resolve({ data: product, error: null }),
  };
  return { supabase: { from: () => q } };
});

import { PriorityPickBlock } from "@/components/guides/PriorityPickBlock";

describe("PriorityPickBlock guide→product bridge", () => {
  it("only queries live in-stock products, links to the PDP and fires guide_product_click", async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><PriorityPickBlock slug="how-to-stop-cat-scratching-furniture" /></MemoryRouter>
      </QueryClientProvider>,
    );
    const name = await waitFor(() => screen.getByText("Sisal Scratching Post"));
    expect(calls).toContain("eq:is_active=true");
    expect(calls).toContain("gt:stock=0");
    expect(name.closest("a")?.getAttribute("href")).toBe("/products/sisal-post");
    fireEvent.click(name);
    expect(trackEvent).toHaveBeenCalledWith("guide_product_click", expect.objectContaining({
      guide_slug: "how-to-stop-cat-scratching-furniture", product_slug: "sisal-post", placement: "priority_pick",
    }));
  });
});

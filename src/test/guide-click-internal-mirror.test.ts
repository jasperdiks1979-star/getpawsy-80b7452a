import { describe, it, expect, vi, beforeEach } from "vitest";

const insert = vi.fn(() => Promise.resolve({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ insert }) } }));

import { mirrorLpFunnelEvent } from "@/lib/lpFunnelMirror";
import { getCanonicalSessionId } from "@/lib/canonicalSession";

describe("guide_product_click internal mirror", () => {
  beforeEach(() => {
    insert.mockClear();
    Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Windows NT 10.0) Chrome/141.0 Safari/537.36", configurable: true });
  });

  it("persists exactly once with slug attribution, placement and canonical session id", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    window.history.pushState({}, "", "/guides/how-to-stop-cat-scratching-furniture");
    const sid = getCanonicalSessionId();
    mirrorLpFunnelEvent("guide_product_click", {
      guide_slug: "how-to-stop-cat-scratching-furniture", product_slug: "sisal-post", placement: "priority_pick",
    });
    const calls = fetchSpy.mock.calls.filter(c => String(c[0]).includes("lp_funnel_events"));
    const rows = [...calls.map(c => JSON.parse(String((c[1] as RequestInit).body))), ...insert.mock.calls.map(c => (c as unknown[])[0] as Record<string, unknown>)];
    expect(rows).toHaveLength(1);
    const row = rows[0] as Record<string, any>;
    expect(row.event_name).toBe("guide_product_click");
    expect(row.placement).toBe("priority_pick");
    expect(row.page_path).toBe("/guides/how-to-stop-cat-scratching-furniture");
    expect(row.session_id).toBe(sid);
    expect(row.raw_payload).toEqual({ guide_slug: "how-to-stop-cat-scratching-furniture", product_slug: "sisal-post", collection_slug: null });
    fetchSpy.mockRestore();
  });

  it("does not add raw_payload to other mirrored events", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    mirrorLpFunnelEvent("view_cart", {});
    const row = (insert.mock.calls[0] as unknown[])?.[0] as Record<string, unknown>;
    expect(row).toBeDefined();
    expect("raw_payload" in row).toBe(false);
    fetchSpy.mockRestore();
  });
});

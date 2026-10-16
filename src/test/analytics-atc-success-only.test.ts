import { describe, it, expect } from "vitest";
import { foldEvents, isSuccessfulAddToCart } from "../../supabase/functions/_shared/canonicalIngest";

const mk = () => ({ sessions: {}, v2: {}, pv_sessionless: [], raw_events: 0, sample_event: null, seen: new Set(), dedup: new Set() }) as any;
const ev = (id: string, at: string, qty: string | null) => ({
  canonical_name: "CANONICAL_ADD_TO_CART", source_system: "cci", source_event_id: id,
  session_id: "s1", visitor_id: "v1", product_id: "p1", occurred_at: at, atc_qty: qty,
});
const fold = (rows: any[]) => { const p = mk(); foldEvents(p, rows, () => "direct"); return p.sessions.s1?.has_add_to_cart ?? false; };

describe("add-to-cart counts only successful adds", () => {
  it("tap + successful add = 1 real add", () => {
    const rows = [ev("tap", "2026-10-12T23:03:49.533Z", null), ev("add", "2026-10-12T23:03:49.577Z", "1")];
    expect(rows.filter(isSuccessfulAddToCart).length).toBe(1);
    expect(fold(rows)).toBe(true);
  });
  it("two successful adds 3.5s apart = 2", () => {
    const rows = [
      ev("t1", "2026-10-12T16:19:43.301Z", null), ev("a1", "2026-10-12T16:19:43.341Z", "1"),
      ev("a2", "2026-10-12T16:19:46.793Z", "1"), ev("t2", "2026-10-12T16:19:46.855Z", null),
    ];
    expect(rows.filter(isSuccessfulAddToCart).length).toBe(2);
  });
  it("tap without successful add = 0", () => {
    const rows = [ev("tap", "2026-10-12T22:00:00.000Z", null)];
    expect(rows.filter(isSuccessfulAddToCart).length).toBe(0);
    expect(fold(rows)).toBe(false);
  });
  it("non-storefront sources are unchanged", () => {
    expect(isSuccessfulAddToCart({ source_system: "ga4", atc_qty: null })).toBe(true);
  });
});

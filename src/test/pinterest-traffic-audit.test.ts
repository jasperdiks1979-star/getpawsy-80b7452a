import { describe, it, expect } from "vitest";
import {
  buildEnrichedBreakdown,
  buildPinterestDrilldown,
  classifyRow,
  type VisitorRow,
} from "@/lib/sourceAuditBreakdown";

const pinSession = (
  sid: string,
  o: Partial<VisitorRow> = {},
): VisitorRow => ({
  session_id: sid,
  utm_source: "pinterest",
  utm_medium: "social",
  referrer: "https://www.pinterest.com/",
  page_path: "/products/foo",
  country: "United States",
  activity_type: "browsing",
  ...o,
});

describe("classifyRow priority", () => {
  it("bot beats internal beats preview beats clean", () => {
    expect(classifyRow({ session_id: "a", is_bot_suspect: true, is_internal: true })).toBe("bot");
    expect(classifyRow({ session_id: "a", is_internal: true })).toBe("internal");
    expect(classifyRow({ session_id: "a", traffic_quality: "pre_render" })).toBe("preview_prefetch");
    expect(classifyRow({ session_id: "a" })).toBe("external_clean");
  });
});

describe("Pinterest source breakdown", () => {
  const rows: VisitorRow[] = [
    pinSession("clean-us"),
    pinSession("clean-nl", { country: "The Netherlands" }),
    pinSession("internal-nl", { country: "The Netherlands", is_internal: true, traffic_quality: "internal" }),
    pinSession("bot", { is_bot_suspect: true, bot_suspect_reason: "ua_match" }),
    pinSession("prefetch", { traffic_quality: "pre_render" }),
  ];

  const enriched = buildEnrichedBreakdown(rows);
  const pin = enriched.find((r) => r.source === "pinterest")!;

  it("splits Pinterest into clean/internal/bot/preview", () => {
    expect(pin.visitors).toBe(5);
    expect(pin.external_clean).toBe(2);
    expect(pin.internal).toBe(1);
    expect(pin.bot).toBe(1);
    expect(pin.preview_prefetch).toBe(1);
  });

  it("splits Pinterest geo into US vs non-US", () => {
    expect(pin.us).toBe(3);
    expect(pin.non_us).toBe(2);
  });

  it("only Pinterest is non-zero for this fixture", () => {
    for (const row of enriched) {
      if (row.source !== "pinterest") expect(row.visitors).toBe(0);
    }
  });
});

describe("Pinterest drilldown + warnings", () => {
  it("warns when Pinterest has traffic but 0 US visitors (NL/EU only)", () => {
    const rows = [
      pinSession("nl1", { country: "The Netherlands" }),
      pinSession("de1", { country: "Germany" }),
    ];
    const d = buildPinterestDrilldown(rows);
    expect(d.totals.visitors).toBe(2);
    expect(d.totals.us).toBe(0);
    expect(d.warnings.some((w) => w.includes("0 US"))).toBe(true);
  });

  it("warns when Pinterest traffic is only internal/test", () => {
    const rows = [
      pinSession("nl1", { country: "The Netherlands", is_internal: true, traffic_quality: "internal" }),
    ];
    const d = buildPinterestDrilldown(rows);
    expect(d.totals.external_clean).toBe(0);
    expect(d.warnings.some((w) => w.includes("internal/test"))).toBe(true);
  });

  it("warns when only preview/prefetch traffic and 0 conversions", () => {
    const rows = [pinSession("p1", { traffic_quality: "pre_render" })];
    const d = buildPinterestDrilldown(rows);
    expect(d.totals.preview_prefetch).toBe(1);
    expect(d.warnings.some((w) => w.includes("preview/prefetch"))).toBe(true);
  });

  it("does NOT warn when clean US traffic exists", () => {
    const rows = [pinSession("us1", { country: "United States" })];
    const d = buildPinterestDrilldown(rows);
    expect(d.warnings).toEqual([]);
    expect(d.totals.external_clean).toBe(1);
    expect(d.totals.us).toBe(1);
  });

  it("aggregates funnel steps as unique sessions", () => {
    const rows = [
      pinSession("a", { activity_type: "product_view" }),
      pinSession("a", { activity_type: "add_to_cart" }),
      pinSession("b", { activity_type: "product_view" }),
    ];
    const d = buildPinterestDrilldown(rows);
    expect(d.funnel.product_view).toBe(2);
    expect(d.funnel.add_to_cart).toBe(1);
    expect(d.funnel.purchase).toBe(0);
  });

  it("extracts pin_id splits from landing URL query", () => {
    const rows = [
      pinSession("s1", { page_path: "/products/x?pin_id=PIN_AAA" }),
      pinSession("s2", { page_path: "/products/x?pin_id=PIN_AAA" }),
      pinSession("s3", { page_path: "/products/y?pin_id=PIN_BBB" }),
    ];
    const d = buildPinterestDrilldown(rows);
    expect(d.byPinId[0]).toEqual({ pin_id: "PIN_AAA", visitors: 2 });
    expect(d.byPinId[1]).toEqual({ pin_id: "PIN_BBB", visitors: 1 });
  });
});

describe("source breakdown explains why visible Pinterest count changes", () => {
  // Sim: World Map with Exclude internal/test ON would only see "clean-us".
  // Off → it would see all 3. The breakdown must surface that delta.
  const rows = [
    pinSession("clean-us", { country: "United States" }),
    pinSession("internal-nl", { country: "The Netherlands", is_internal: true, traffic_quality: "internal" }),
    pinSession("bot", { is_bot_suspect: true }),
  ];

  it("with Exclude internal/test OFF: total Pinterest=3, clean=1, internal=1, bot=1", () => {
    const pin = buildEnrichedBreakdown(rows).find((r) => r.source === "pinterest")!;
    expect(pin.visitors).toBe(3);
    expect(pin.external_clean).toBe(1);
    expect(pin.internal).toBe(1);
    expect(pin.bot).toBe(1);
  });

  it("simulated Exclude internal/test ON: only clean session remains", () => {
    const filtered = rows.filter((r) => !r.is_internal); // matches World Map RLS-style filter
    const pin = buildEnrichedBreakdown(filtered).find((r) => r.source === "pinterest")!;
    expect(pin.visitors).toBe(2); // clean + bot (bot is not excluded by this toggle)
    expect(pin.external_clean).toBe(1);
    expect(pin.internal).toBe(0);
  });

  it("simulated US-only ON: only US sessions remain", () => {
    const filtered = rows.filter((r) => r.country === "United States");
    const pin = buildEnrichedBreakdown(filtered).find((r) => r.source === "pinterest")!;
    expect(pin.visitors).toBe(1);
    expect(pin.us).toBe(1);
    expect(pin.non_us).toBe(0);
  });
});
import { describe, it, expect } from "vitest";
import { resolveCanonicalSource } from "@/lib/canonicalSource";

describe("resolveCanonicalSource", () => {
  it("classifies utm_source=pinterest as pinterest", () => {
    expect(resolveCanonicalSource({ utm_source: "pinterest", utm_medium: "social" })).toBe("pinterest");
  });

  it("classifies pinterest referrer with no UTM as pinterest", () => {
    expect(resolveCanonicalSource({ referrer: "https://www.pinterest.com/", referrer_category: "social" })).toBe("pinterest");
    expect(resolveCanonicalSource({ referrer: "https://de.pinterest.com/" })).toBe("pinterest");
  });

  it("classifies pin.it shortlink referrer as pinterest", () => {
    expect(resolveCanonicalSource({ referrer: "https://pin.it/abc" })).toBe("pinterest");
  });

  it("classifies paid Pinterest (paid_social medium) as pinterest", () => {
    expect(resolveCanonicalSource({ utm_source: "pinterest", utm_medium: "paid_social", utm_campaign: "ads_winter" })).toBe("pinterest");
  });

  it("classifies pin_id query param as pinterest even with empty utm", () => {
    expect(resolveCanonicalSource({ pin_id: "abc-123" })).toBe("pinterest");
    expect(resolveCanonicalSource({ page_path: "/products/x?hook=foo&pin_id=abc" })).toBe("pinterest");
  });

  it("classifies case variants (Pinterest, PINTEREST) as pinterest", () => {
    expect(resolveCanonicalSource({ utm_source: "Pinterest" })).toBe("pinterest");
    expect(resolveCanonicalSource({ utm_source: "PINTEREST" })).toBe("pinterest");
    expect(resolveCanonicalSource({ utm_source: "pinterest.com" })).toBe("pinterest");
  });

  it("never returns direct when Pinterest referrer is present", () => {
    const r = resolveCanonicalSource({ referrer: "https://www.pinterest.com/", utm_source: null, utm_medium: null });
    expect(r).not.toBe("direct");
    expect(r).toBe("pinterest");
  });

  it("classifies tiktok via ttclid and referrer", () => {
    expect(resolveCanonicalSource({ ttclid: "x" })).toBe("tiktok");
    expect(resolveCanonicalSource({ referrer: "https://www.tiktok.com/" })).toBe("tiktok");
  });

  it("classifies google via gclid and referrer", () => {
    expect(resolveCanonicalSource({ gclid: "x" })).toBe("google");
    expect(resolveCanonicalSource({ referrer: "https://www.google.com/" })).toBe("google");
  });

  it("returns direct only when there are no signals at all", () => {
    expect(resolveCanonicalSource({})).toBe("direct");
    expect(resolveCanonicalSource({ utm_source: null, referrer: null })).toBe("direct");
  });

  it("returns referral for unknown referrer host with no utm", () => {
    expect(resolveCanonicalSource({ referrer: "https://example.com/" })).toBe("referral");
  });

  it("matches Attribution Compare: same pinterest row resolves the same way in every surface", () => {
    // Real row pulled from production utm_session_log:
    const visitorMapRow = { utm_source: "pinterest", utm_medium: "social", referrer: "https://www.pinterest.com/", referrer_category: "social" };
    const attributionCompareRow = { utm_source: "pinterest", utm_medium: "social", referrer: "https://www.pinterest.com/" };
    const visitorTimelineRow = { utm_source: "pinterest", referrer: "https://www.pinterest.com/" };
    expect(resolveCanonicalSource(visitorMapRow)).toBe("pinterest");
    expect(resolveCanonicalSource(attributionCompareRow)).toBe("pinterest");
    expect(resolveCanonicalSource(visitorTimelineRow)).toBe("pinterest");
  });
});
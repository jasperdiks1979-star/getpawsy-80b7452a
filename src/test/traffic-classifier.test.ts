// Vitest suite for the shared rules-based classifier.
// Mirrors regression cases from the fix specification.
import { describe, it, expect } from "vitest";
import {
  classifyTraffic,
  aggregateSessionQuality,
  CLASSIFIER_VERSION,
} from "../../supabase/functions/_shared/traffic-classifier";
import { isTechnicalPath } from "../lib/technicalRoutes";

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

describe("technical route detection", () => {
  it("flags /api/img as technical", () => {
    expect(isTechnicalPath("/api/img/foo.jpg")).toBe(true);
  });
  it("flags any /api/* as technical", () => {
    expect(isTechnicalPath("/api/anything")).toBe(true);
  });
  it("flags /favicon.ico + /robots.txt + sitemap as technical", () => {
    expect(isTechnicalPath("/favicon.ico")).toBe(true);
    expect(isTechnicalPath("/robots.txt")).toBe(true);
    expect(isTechnicalPath("/sitemap.xml")).toBe(true);
  });
  it("does not flag storefront routes", () => {
    expect(isTechnicalPath("/")).toBe(false);
    expect(isTechnicalPath("/product/xyz")).toBe(false);
  });
});

describe("classifier priority", () => {
  it("case 1: /api/img creates technical, never human/uncertain", () => {
    const r = classifyTraffic({ page_path: "/api/img/x.png", user_agent: CHROME_UA });
    expect(r.traffic_quality).toBe("technical");
    expect(r.technical_path).toBe(true);
  });

  it("case 2: /api/* -> technical", () => {
    expect(classifyTraffic({ page_path: "/api/foo" }).traffic_quality).toBe("technical");
  });

  it("case 3: known crawler UA -> bot", () => {
    const r = classifyTraffic({
      page_path: "/",
      user_agent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    });
    expect(r.traffic_quality).toBe("bot");
    expect(r.bot_reason).toBe("known_crawler_ua");
  });

  it("case 4: Lighthouse -> bot or technical", () => {
    const r = classifyTraffic({
      page_path: "/",
      user_agent: "Mozilla/5.0 Chrome-Lighthouse",
    });
    expect(["bot", "technical"]).toContain(r.traffic_quality);
  });

  it("case 5: internal hint stays internal", () => {
    const r = classifyTraffic({ page_path: "/", is_internal_hint: true, user_agent: CHROME_UA });
    expect(r.traffic_quality).toBe("internal");
  });

  it("case 6: 0s bounce without other evidence -> uncertain, not bot", () => {
    const r = classifyTraffic({
      page_path: "/",
      user_agent: CHROME_UA,
      engagement_ms: 0,
      pageviews: 1,
    });
    expect(r.traffic_quality).toBe("uncertain");
  });

  it("case 7: short session with add_to_cart -> human", () => {
    const r = classifyTraffic({
      page_path: "/product/x",
      user_agent: CHROME_UA,
      engagement_ms: 800,
      has_atc: true,
    });
    expect(r.traffic_quality).toBe("human");
  });

  it("case 8: long headless session stays bot", () => {
    const r = classifyTraffic({
      page_path: "/",
      user_agent: "Mozilla/5.0 HeadlessChrome/120",
      engagement_ms: 60_000,
      interaction_count: 0,
    });
    expect(r.traffic_quality).toBe("bot");
  });

  it("case 9: lone datacenter/VPN signal -> uncertain, not bot", () => {
    const r = classifyTraffic({
      page_path: "/",
      user_agent: CHROME_UA,
      datacenter_signal: true,
    });
    expect(r.traffic_quality).toBe("uncertain");
  });

  it("engagement >= 3s alone does NOT force human", () => {
    const r = classifyTraffic({
      page_path: "/",
      user_agent: CHROME_UA,
      engagement_ms: 10_000,
      pageviews: 1,
      interaction_count: 0,
    });
    expect(r.traffic_quality).toBe("uncertain");
  });

  it("strong-human beats weak bot_suspect hint", () => {
    const r = classifyTraffic({
      page_path: "/checkout",
      user_agent: CHROME_UA,
      has_checkout: true,
      is_bot_suspect_hint: true,
      bot_suspect_reason: "weak_pattern",
    });
    expect(r.traffic_quality).toBe("human");
  });

  it("high-confidence existing bot_suspect (no strong-human) -> bot", () => {
    const r = classifyTraffic({
      page_path: "/",
      user_agent: CHROME_UA,
      is_bot_suspect_hint: true,
      bot_suspect_reason: "declared_bot",
    });
    expect(r.traffic_quality).toBe("bot");
  });

  it("classifier_version stamped v1", () => {
    const r = classifyTraffic({ page_path: "/" });
    expect(r.classification_version).toBe(CLASSIFIER_VERSION);
  });
});

describe("session aggregation", () => {
  it("internal wins over everything", () => {
    expect(
      aggregateSessionQuality(
        [{ traffic_quality: "human" }, { traffic_quality: "internal" }],
        false,
      ),
    ).toBe("internal");
  });
  it("bot beats uncertain without strong-human", () => {
    expect(
      aggregateSessionQuality(
        [{ traffic_quality: "uncertain" }, { traffic_quality: "bot" }],
        false,
      ),
    ).toBe("bot");
  });
  it("strong-human protects human session from lone bot signal", () => {
    expect(
      aggregateSessionQuality(
        [{ traffic_quality: "human" }, { traffic_quality: "bot" }],
        true,
      ),
    ).toBe("human");
  });
  it("all-technical session stays technical", () => {
    expect(
      aggregateSessionQuality(
        [{ traffic_quality: "technical" }, { traffic_quality: "technical" }],
        false,
      ),
    ).toBe("technical");
  });
  it("empty session -> uncertain", () => {
    expect(aggregateSessionQuality([], false)).toBe("uncertain");
  });
});
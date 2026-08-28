import { describe, it, expect } from "vitest";
import {
  classifySession,
  classifySource,
  summarizeTrafficQuality,
  type ClassifierSession,
} from "@/lib/trafficQualityClassifier";

const base: ClassifierSession = {
  session_id: "s1",
  first_seen_at: "2026-08-28T08:00:00Z",
  last_seen_at: "2026-08-28T08:00:01Z",
  country: "US",
  city: "Ashburn",
  device: "desktop",
  page_views: 1,
  source: "direct",
};

describe("human classification", () => {
  it("0-2s desktop direct single page with no events -> bot", () => {
    expect(classifySession(base).traffic_quality_class).toBe("PROBABLE_BOT_OR_AUTOMATION");
  });

  it("20s+ single-page heartbeat alone is only POSSIBLE_HUMAN", () => {
    const r = classifySession({ ...base, last_seen_at: "2026-08-28T08:00:30Z" });
    expect(r.traffic_quality_class).toBe("POSSIBLE_HUMAN");
  });

  it("20s+ plus a second signal is human without any conversion", () => {
    const r = classifySession({
      ...base, last_seen_at: "2026-08-28T08:00:30Z", page_views: 2,
    });
    expect(r.traffic_quality_class).toBe("PROBABLE_HUMAN");
  });

  it("pageviews>=3 alone (0-2s burst) is NOT human", () => {
    const r = classifySession({ ...base, page_views: 4, last_seen_at: "2026-08-28T08:00:01Z" });
    expect(r.traffic_quality_class).toBe("PROBABLE_BOT_OR_AUTOMATION");
  });

  it("pageviews>=3 with plausible timing is human", () => {
    const r = classifySession({ ...base, page_views: 3, last_seen_at: "2026-08-28T08:00:20Z" });
    expect(r.traffic_quality_class).toBe("PROBABLE_HUMAN");
  });

  it("implausible pageviews-per-second is automation unless hard commerce", () => {
    expect(
      classifySession({ ...base, page_views: 8, last_seen_at: "2026-08-28T08:00:03Z" })
        .traffic_quality_class,
    ).toBe("PROBABLE_BOT_OR_AUTOMATION");
    expect(
      classifySession({
        ...base, page_views: 8, last_seen_at: "2026-08-28T08:00:03Z", has_add_to_cart: true,
      }).traffic_quality_class,
    ).toBe("PROBABLE_HUMAN");
  });

  it("add_to_cart is human even when short", () => {
    const r = classifySession({ ...base, has_add_to_cart: true });
    expect(r.traffic_quality_class).toBe("PROBABLE_HUMAN");
    expect(r.commercial_intent_score).toBeGreaterThanOrEqual(25);
  });

  it("strict v3: 3-19s single-page direct desktop is no longer human", () => {
    const r = classifySession({ ...base, last_seen_at: "2026-08-28T08:00:08Z" });
    expect(["UNKNOWN", "PROBABLE_BOT_OR_AUTOMATION"]).toContain(r.traffic_quality_class);
  });

  it("strict v3: weak direct needs >=5s AND >=2 distinct paths for POSSIBLE_HUMAN", () => {
    const r = classifySession({
      ...base, last_seen_at: "2026-08-28T08:00:09Z", page_views: 2, distinct_paths: 2,
    });
    expect(r.traffic_quality_class).toBe("POSSIBLE_HUMAN");
  });

  it("strict v3: ultra-short direct desktop PDP sweep is automation, not possible human", () => {
    const r = classifySession({
      ...base,
      landing_page: "/products/cat-scratcher",
      has_product_view: true,
      last_seen_at: "2026-08-28T08:00:02Z",
    });
    expect(r.traffic_quality_class).toBe("PROBABLE_BOT_OR_AUTOMATION");
    expect(r.product_interest_confirmed).toBe(false);
  });

  it("strict v3: burst guard trips above 0.6 pageviews/second", () => {
    const r = classifySession({
      ...base, page_views: 3, last_seen_at: "2026-08-28T08:00:04Z",
    });
    expect(r.traffic_quality_class).toBe("PROBABLE_BOT_OR_AUTOMATION");
  });

  it("strict v3: mobile direct PDP with no other evidence stays UNKNOWN, not human", () => {
    const r = classifySession({
      ...base,
      device: "mobile",
      user_agent: "Mozilla/5.0 (iPhone) Safari",
      landing_page: "/products/cat-scratcher",
      has_product_view: true,
      last_seen_at: "2026-08-28T08:00:02Z",
    });
    expect(["UNKNOWN", "PROBABLE_BOT_OR_AUTOMATION"]).toContain(r.traffic_quality_class);
  });

  it("product interest is confirmed only with corroborating engagement", () => {
    const bare = classifySession({
      ...base, landing_page: "/products/x", has_product_view: true,
      last_seen_at: "2026-08-28T08:00:01Z",
    });
    expect(bare.product_interest_confirmed).toBe(false);

    const dwell = classifySession({
      ...base, landing_page: "/products/x", has_product_view: true,
      last_seen_at: "2026-08-28T08:00:15Z",
    });
    expect(dwell.product_interest_confirmed).toBe(true);

    const cart = classifySession({
      ...base, landing_page: "/products/x", has_product_view: true, has_add_to_cart: true,
    });
    expect(cart.product_interest_confirmed).toBe(true);
  });

  it("external search sessions stay human", () => {
    const r = classifySession({
      ...base,
      referrer: "https://www.google.com/",
      landing_page: "/products/x",
      page_views: 2,
      last_seen_at: "2026-08-28T08:00:12Z",
    });
    expect(r.traffic_quality_class).toBe("PROBABLE_HUMAN");
  });


  it("city alone never makes a session a bot", () => {
    const r = classifySession({
      ...base, city: "Ashburn", last_seen_at: "2026-08-28T08:01:00Z", device: "mobile",
      page_views: 2,
    });
    expect(r.traffic_quality_class).toBe("PROBABLE_HUMAN");
  });

  it("lovable preview markers are INTERNAL_OR_TEST at confidence 1", () => {
    const q = classifySession({ ...base, landing_page: "/?__lovable_sha=abc" });
    expect(q.traffic_quality_class).toBe("INTERNAL_OR_TEST");
    expect(q.traffic_quality_confidence).toBe(1);
    expect(classifySession({ ...base, referrer: "https://preview.lovable.dev/x" }).traffic_quality_class)
      .toBe("INTERNAL_OR_TEST");
    expect(classifySession({ ...base, landing_page: "/admin/visitor-world-map-pro" }).traffic_quality_class)
      .toBe("INTERNAL_OR_TEST");
    expect(classifySession({ ...base, landing_page: "/dashboard" }).traffic_quality_class)
      .toBe("INTERNAL_OR_TEST");
  });


  it("internal flag wins", () => {
    expect(classifySession({ ...base, is_internal: true }).traffic_quality_class).toBe("INTERNAL_OR_TEST");
  });

  it("bot user agent -> bot", () => {
    const r = classifySession({ ...base, user_agent: "Mozilla/5.0 (compatible; Googlebot/2.1)" });
    expect(r.traffic_quality_class).toBe("PROBABLE_BOT_OR_AUTOMATION");
  });
});

describe("source classification", () => {
  it("generic pinterest referrer is organic, not paid", () => {
    expect(classifySource({ referrer: "https://www.pinterest.com/pin/123" }).source_class)
      .toBe("PINTEREST_ORGANIC");
  });
  it("pinterest + cpc medium is paid", () => {
    expect(classifySource({ utm_source: "pinterest", utm_medium: "cpc" }).source_class)
      .toBe("PINTEREST_PAID");
  });
  it("google organic", () => {
    expect(classifySource({ referrer: "https://www.google.com/" }).source_class).toBe("GOOGLE_ORGANIC");
  });
  it("bing -> other search", () => {
    expect(classifySource({ referrer: "https://www.bing.com/" }).source_class).toBe("OTHER_SEARCH");
  });
  it("no referrer/utm -> direct", () => {
    expect(classifySource({}).source_class).toBe("DIRECT");
  });
});

describe("intent + summary", () => {
  it("purchase session is HIGH tier", () => {
    const r = classifySession({
      ...base, has_product_view: true, has_add_to_cart: true, has_checkout: true,
      has_purchase: true, order_value: 44.9,
    });
    expect(r.commercial_intent_tier).toBe("HIGH");
    expect(r.commercial_intent_score).toBe(100);
  });

  it("summary keeps zero commerce at zero and does not inflate humans", () => {
    const rows: ClassifierSession[] = Array.from({ length: 40 }, (_, i) => ({
      ...base, session_id: `bot-${i}`,
    }));
    const s = summarizeTrafficQuality(rows);
    expect(s.total_sessions).toBe(40);
    expect(s.conservative_humans).toBe(0);
    expect(s.commerce_human.add_to_cart).toBe(0);
    expect(s.quality.PROBABLE_BOT_OR_AUTOMATION).toBe(40);
    expect(s.bot_clusters[0].sessions).toBe(40);
  });
});

import { describe, it, expect } from "vitest";
import {
  buildLiveTimeline,
  buildLiveVisitorProfile,
  isLiveHeartbeatFresh,
  computeLatencyMs,
  LIVE_HEARTBEAT_TTL_SECONDS,
  type LiveVisitorActivityRow,
} from "@/lib/liveVisitorTimeline";

const NOW = Date.parse("2026-01-01T12:00:00Z");
const iso = (offsetSec: number) => new Date(NOW - offsetSec * 1000).toISOString();

function row(overrides: Partial<LiveVisitorActivityRow>): LiveVisitorActivityRow {
  return {
    session_id: "s1",
    created_at: iso(60),
    last_seen_at: iso(60),
    ...overrides,
  };
}

describe("buildLiveTimeline", () => {
  it("orders steps oldest → newest and collapses consecutive dupes", () => {
    const steps = buildLiveTimeline([
      row({ activity_type: "browsing", page_path: "/", last_seen_at: iso(300) }),
      row({ activity_type: "browsing", page_path: "/", last_seen_at: iso(280) }),
      row({ activity_type: "product_view", page_path: "/p/toy", product_name: "Toy", last_seen_at: iso(200) }),
      row({ activity_type: "add_to_cart", product_name: "Toy", last_seen_at: iso(150) }),
      row({ activity_type: "begin_checkout", last_seen_at: iso(90) }),
      row({ activity_type: "purchase", order_id: "ORD-1", order_value: 42, last_seen_at: iso(30) }),
    ]);
    expect(steps.map((s) => s.activity_type)).toEqual([
      "browsing",
      "product_view",
      "add_to_cart",
      "begin_checkout",
      "purchase",
    ]);
    expect(steps[steps.length - 1].label).toContain("ORD-1");
  });

  it("returns empty timeline for empty input", () => {
    expect(buildLiveTimeline([])).toEqual([]);
  });
});

describe("buildLiveVisitorProfile", () => {
  it("derives navigation, attribution and funnel status from raw rows", () => {
    const profile = buildLiveVisitorProfile(
      [
        row({
          activity_type: "browsing",
          page_path: "/",
          utm_source: "pinterest",
          utm_campaign: "spring",
          referrer: "https://pinterest.com/pin/1",
          device_type: "mobile",
          browser: "Safari",
          screen_width: 390,
          screen_height: 844,
          country: "US",
          city: "Austin",
          last_seen_at: iso(300),
        }),
        row({ activity_type: "browsing", page_path: "/collections/toys", last_seen_at: iso(200) }),
        row({
          activity_type: "product_view",
          page_path: "/p/toy",
          product_name: "Cat Toy",
          product_category: "toys",
          last_seen_at: iso(150),
        }),
        row({ activity_type: "add_to_cart", product_name: "Cat Toy", last_seen_at: iso(90) }),
        row({ activity_type: "begin_checkout", last_seen_at: iso(60) }),
        row({ activity_type: "purchase", order_id: "ORD-9", order_value: 79.5, last_seen_at: iso(15) }),
      ],
      NOW,
    );
    expect(profile).not.toBeNull();
    expect(profile!.landing_page).toBe("/");
    expect(profile!.previous_page).toBe("/collections/toys");
    expect(profile!.current_page).toBeTruthy();
    expect(profile!.current_product).toBe("Cat Toy");
    expect(profile!.traffic_source).toBe("pinterest");
    expect(profile!.utm.campaign).toBe("spring");
    expect(profile!.cart_status).toBe("add_to_cart");
    expect(profile!.checkout_status).toBe("begin_checkout");
    expect(profile!.purchase_status).toBe("purchased");
    expect(profile!.current_revenue).toBe(79.5);
    expect(profile!.heartbeat_age_seconds).toBe(15);
    expect(profile!.session_duration_seconds).toBe(285);
    expect(profile!.device).toBe("mobile");
    expect(profile!.screen).toBe("390×844");
  });

  it("returns null for empty rows", () => {
    expect(buildLiveVisitorProfile([], NOW)).toBeNull();
  });
});

describe("heartbeat helpers", () => {
  it("treats heartbeats within TTL as fresh and older as stale", () => {
    expect(isLiveHeartbeatFresh(iso(30), NOW)).toBe(true);
    expect(isLiveHeartbeatFresh(iso(LIVE_HEARTBEAT_TTL_SECONDS - 1), NOW)).toBe(true);
    expect(isLiveHeartbeatFresh(iso(LIVE_HEARTBEAT_TTL_SECONDS + 5), NOW)).toBe(false);
    expect(isLiveHeartbeatFresh(null, NOW)).toBe(false);
  });

  it("computeLatencyMs never returns negative", () => {
    expect(computeLatencyMs(100, 250)).toBe(150);
    expect(computeLatencyMs(500, 400)).toBe(0);
  });
});
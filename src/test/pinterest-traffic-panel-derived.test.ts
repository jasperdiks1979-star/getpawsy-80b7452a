import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { derivePinterestTruthStats, selectPinterestTruthSessions } from "@/lib/pinterestTruthPanel";
import { buildWorldMapModel } from "@/lib/visitorWorldMapCanonicalFeatures";
import type { TruthSession } from "@/hooks/useAnalyticsTruth";

const PANEL_SRC = readFileSync(
  resolve(__dirname, "../components/admin/widgets/PinterestTrafficPanel.tsx"),
  "utf8",
);

function session(over: Partial<TruthSession>): TruthSession {
  return {
    session_id: Math.random().toString(36).slice(2),
    visitor_id: null,
    country: "US",
    city: "Austin",
    latitude: 30,
    longitude: -97,
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    page_views: 1,
    source: "pinterest",
    device: "mobile",
    utm_source: "pinterest",
    utm_medium: "social",
    utm_campaign: "cat-perch",
    referrer: "https://pinterest.com/",
    page_path: "/products/cat-wall-perch",
    has_product_view: true,
    has_add_to_cart: false,
    has_view_cart: false,
    has_checkout: false,
    has_purchase: false,
    order_value: 0,
    is_internal: false,
    ...over,
  };
}

describe("PinterestTrafficPanel · derived-only contract", () => {
  it("performs no independent backend request", () => {
    expect(PANEL_SRC).not.toMatch(/supabase/i);
    expect(PANEL_SRC).not.toMatch(/\.from\(/);
    expect(PANEL_SRC).not.toMatch(/useQuery/);
  });

  it("reconciles exactly with the world map source=pinterest session count", () => {
    const sessions = [
      session({}),
      session({ has_add_to_cart: true }),
      session({ utm_source: "tiktok", referrer: "https://tiktok.com/", source: "tiktok" }),
      session({ utm_source: null, referrer: null, source: "direct" }),
    ];
    const stats = derivePinterestTruthStats(sessions, { usOnly: false, excludeInternal: false });
    const model = buildWorldMapModel(sessions, {
      activityFilter: "all",
      sourceFilter: "pinterest",
      usOnly: false,
      excludeInternal: false,
    });
    expect(stats.sessions).toBe(model.truthSessions.length);
    expect(stats.sessions).toBe(2);
    expect(stats.addToCart).toBe(1);
  });

  it("honours usOnly and excludeInternal filters", () => {
    const sessions = [
      session({}),
      session({ country: "NL", city: "Amsterdam" }),
      session({ is_internal: true }),
    ];
    expect(selectPinterestTruthSessions(sessions, { usOnly: true }).length).toBe(2);
    expect(selectPinterestTruthSessions(sessions, { excludeInternal: true }).length).toBe(2);
    expect(selectPinterestTruthSessions(sessions, {}).length).toBe(3);
  });

  it("returns a valid zero state when the payload has no pinterest sessions", () => {
    const stats = derivePinterestTruthStats([session({ utm_source: "tiktok", referrer: null, source: "tiktok" })]);
    expect(stats.sessions).toBe(0);
    expect(stats.conversionRate).toBe(0);
  });
});

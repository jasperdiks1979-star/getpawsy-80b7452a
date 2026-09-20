import { describe, it, expect } from "vitest";
import {
  buildHumanFirstView,
  isEligible,
  DEFAULT_TRAFFIC_MODE,
  type HumanFirstSession,
} from "@/lib/humanFirstAnalytics";

const base = (over: Partial<HumanFirstSession>): HumanFirstSession => ({
  session_id: Math.random().toString(36).slice(2),
  visitor_id: null,
  first_seen_at: "2026-09-19T10:00:00Z",
  last_seen_at: "2026-09-19T10:01:00Z",
  country: "United States",
  device: "desktop",
  browser: "chrome",
  page_views: 2,
  landing_page: "/",
  ...over,
});

// A clearly human search session: coherent referrer, real dwell, navigation.
const human = (over: Partial<HumanFirstSession> = {}) =>
  base({
    referrer: "https://www.google.com/",
    landing_page: "/guides/indoor-cat-setup",
    page_views: 3,
    distinct_paths: 3,
    interaction_count: 4,
    session_duration_seconds: 95,
    has_product_view: true,
    ...over,
  });

// Burst automation: many pageviews in ~0 seconds, no metadata at all.
const bot = (over: Partial<HumanFirstSession> = {}) =>
  base({
    referrer: null,
    browser: null,
    user_agent: null,
    landing_page: "/",
    page_views: 9,
    distinct_paths: 1,
    session_duration_seconds: 1,
    ...over,
  });

describe("human-first eligibility rule", () => {
  it("defaults to strict human", () => {
    expect(DEFAULT_TRAFFIC_MODE).toBe("human");
  });

  it("strict mode admits only PROBABLE_HUMAN", () => {
    expect(isEligible("PROBABLE_HUMAN", "human")).toBe(true);
    expect(isEligible("POSSIBLE_HUMAN", "human")).toBe(false);
    expect(isEligible("UNKNOWN", "human")).toBe(false);
    expect(isEligible("PROBABLE_BOT_OR_AUTOMATION", "human")).toBe(false);
    expect(isEligible("INTERNAL_OR_TEST", "human")).toBe(false);
  });

  it("expanded mode adds POSSIBLE_HUMAN but never bots or internal", () => {
    expect(isEligible("POSSIBLE_HUMAN", "expanded")).toBe(true);
    expect(isEligible("UNKNOWN", "expanded")).toBe(false);
    expect(isEligible("PROBABLE_BOT_OR_AUTOMATION", "expanded")).toBe(false);
    expect(isEligible("INTERNAL_OR_TEST", "expanded")).toBe(false);
  });

  it("raw mode admits everything (diagnostics)", () => {
    for (const c of ["PROBABLE_HUMAN", "POSSIBLE_HUMAN", "UNKNOWN", "PROBABLE_BOT_OR_AUTOMATION", "INTERNAL_OR_TEST"] as const) {
      expect(isEligible(c, "raw")).toBe(true);
    }
  });
});

describe("buildHumanFirstView", () => {
  const rows: HumanFirstSession[] = [
    ...Array.from({ length: 3 }, () => human()),
    ...Array.from({ length: 20 }, () => bot()),
  ];

  it("excludes bot traffic from default commercial KPIs", () => {
    const strict = buildHumanFirstView(rows, "human");
    const raw = buildHumanFirstView(rows, "raw");
    expect(raw.metrics.sessions).toBe(23);
    expect(strict.metrics.sessions).toBeLessThan(raw.metrics.sessions);
    expect(strict.metrics.sessions).toBeGreaterThan(0);
    expect(strict.metrics.page_views).toBeLessThan(raw.metrics.page_views);
  });

  it("reports quality totals independent of the selected mode", () => {
    const strict = buildHumanFirstView(rows, "human");
    const raw = buildHumanFirstView(rows, "raw");
    expect(strict.quality).toEqual(raw.quality);
    expect(strict.quality.total).toBe(23);
    expect(strict.quality.bot).toBeGreaterThan(0);
    expect(strict.quality.bot_share_pct).toBeGreaterThan(50);
  });

  it("uses ONE denominator across metrics, funnel and dimensions", () => {
    const v = buildHumanFirstView(rows, "human");
    const sumDim = (rs: typeof v.channels) => rs.reduce((a, r) => a + r.sessions, 0);
    expect(v.funnel[0].count).toBe(v.metrics.sessions);
    expect(sumDim(v.channels)).toBe(v.metrics.sessions);
    expect(sumDim(v.countries)).toBe(v.metrics.sessions);
    expect(sumDim(v.devices)).toBe(v.metrics.sessions);
    expect(v.channels.reduce((a, r) => a + r.page_views, 0)).toBe(v.metrics.page_views);
  });

  it("never invents conversions when production shows none", () => {
    const v = buildHumanFirstView(rows, "human");
    expect(v.metrics.add_to_cart).toBe(0);
    expect(v.metrics.checkout_started).toBe(0);
    expect(v.metrics.purchases).toBe(0);
    expect(v.metrics.revenue).toBe(0);
    expect(v.metrics.conversion_rate).toBe(0);
  });

  it("keeps every raw session auditable with classification reasons", () => {
    const v = buildHumanFirstView(rows, "human");
    expect(v.drilldown).toHaveLength(23);
    expect(v.drilldown.every((d) => d.reasons.length > 0)).toBe(true);
    expect(v.drilldown.some((d) => d.eligible === false)).toBe(true);
  });

  it("separates guide/content traffic using the same rule", () => {
    const v = buildHumanFirstView(rows, "human");
    const guideSessions = v.guideTraffic.reduce((a, r) => a + r.sessions, 0);
    expect(guideSessions).toBeLessThanOrEqual(v.metrics.sessions);
  });

  it("handles an empty window without dividing by zero", () => {
    const v = buildHumanFirstView([], "human");
    expect(v.metrics.sessions).toBe(0);
    expect(v.metrics.conversion_rate).toBe(0);
    expect(v.quality.bot_share_pct).toBe(0);
  });
});

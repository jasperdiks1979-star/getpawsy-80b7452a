import { describe, it, expect } from "vitest";
import {
  classifyAcquisitionBucket,
  isCommercialSession,
  isOrganicSession,
  eventCountsForCommercialFunnel,
} from "@/lib/commercialInclusion";
import { buildSplit, type AcquisitionRow } from "@/hooks/useTrafficClassSplit";

const row = (r: Partial<AcquisitionRow>): AcquisitionRow => ({
  acquisition_bucket: "UNKNOWN",
  commercial_included: false,
  sessions: 0, visitors: 0, page_views: 0, product_views: 0,
  add_to_cart: 0, checkout_started: 0, purchases: 0, revenue_cents: 0,
  ...r,
} as AcquisitionRow);

describe("ANALYTICS TRUTH REPAIR — commercial inclusion contract", () => {
  it("1. UNKNOWN + exclude_from_commercial + legacy direct → not commercial, not organic", () => {
    const s = {
      traffic_class: "UNKNOWN",
      exclude_from_commercial: true,
      classified_channel: "direct",
      classification_reason: "no_signal_no_evidence",
    };
    expect(classifyAcquisitionBucket(s)).toBe("UNKNOWN");
    expect(isCommercialSession(s)).toBe(false);
    expect(isOrganicSession(s)).toBe(false);
  });

  it("2. crawler session with classified_channel=direct is excluded", () => {
    const s = { traffic_class: "CRAWLER", is_bot: true, classified_channel: "direct" };
    expect(classifyAcquisitionBucket(s)).toBe("BOT");
    expect(isCommercialSession(s)).toBe(false);
  });

  it("3. internal_preview marked human by weak client logic is excluded", () => {
    const s = {
      traffic_class: "INTERNAL_PREVIEW",
      is_internal: true,
      classified_channel: "internal_preview",
      classification_reason: "lovable_preview_signal",
    };
    expect(classifyAcquisitionBucket(s)).toBe("INTERNAL");
    expect(isCommercialSession(s)).toBe(false);
  });

  it("4. true organic search session is commercial + ORGANIC_SEARCH", () => {
    const s = {
      traffic_class: "HUMAN_PROBABLE",
      classified_channel: "duckduckgo_organic",
      classification_reason: "ddg_referrer",
      exclude_from_commercial: false,
    };
    expect(classifyAcquisitionBucket(s)).toBe("ORGANIC_SEARCH");
    expect(isCommercialSession(s)).toBe(true);
    expect(isOrganicSession(s)).toBe(true);
  });

  it("5. true Pinterest organic session is commercial + PINTEREST_ORGANIC", () => {
    const s = {
      traffic_class: "HUMAN_PROBABLE",
      classified_channel: "pinterest_organic",
      classification_reason: "pinterest_referrer",
    };
    expect(classifyAcquisitionBucket(s)).toBe("PINTEREST_ORGANIC");
    expect(isCommercialSession(s)).toBe(true);
    expect(isOrganicSession(s)).toBe(true);
  });

  it("6. human-evidence direct is DIRECT, never organic search", () => {
    const s = {
      traffic_class: "HUMAN_PROBABLE",
      classified_channel: "direct",
      classification_reason: "human_evidence_direct",
      exclude_from_commercial: false,
    };
    expect(classifyAcquisitionBucket(s)).toBe("DIRECT");
    expect(isCommercialSession(s)).toBe(true);
    expect(isOrganicSession(s)).toBe(false);
  });

  it("7. events from an excluded session never reach the commercial funnel", () => {
    const excluded = { traffic_class: "UNKNOWN", exclude_from_commercial: true, classified_channel: "direct" };
    expect(eventCountsForCommercialFunnel(excluded)).toBe(false);

    const split = buildSplit([
      row({ acquisition_bucket: "UNKNOWN", commercial_included: false, sessions: 1022, visitors: 1022, add_to_cart: 2, checkout_started: 1, page_views: 3000 }),
      row({ acquisition_bucket: "ORGANIC_SEARCH", commercial_included: true, sessions: 4, visitors: 4, page_views: 9, product_views: 3 }),
    ]);
    expect(split.unknownExcluded.add_to_cart).toBe(0);
    expect(split.unknownExcluded.checkout_started).toBe(0);
    expect(split.unknownExcluded.page_views).toBe(0);
    expect(split.organic.sessions).toBe(4);
    expect(split.commercial.sessions).toBe(4);
    // UNKNOWN must never appear inside Organic.
    expect(split.organic.sessions).not.toBe(1026);
  });

  it("8. purchase + revenue from an included commercial session is retained", () => {
    const s = { traffic_class: "HUMAN_PROBABLE", classified_channel: "pinterest_organic" };
    expect(eventCountsForCommercialFunnel(s)).toBe(true);
    const split = buildSplit([
      row({ acquisition_bucket: "PINTEREST_ORGANIC", commercial_included: true, sessions: 3, visitors: 3, product_views: 5, add_to_cart: 2, checkout_started: 1, purchases: 1, revenue_cents: 4490 }),
    ]);
    expect(split.commercial.purchases).toBe(1);
    expect(split.commercial.revenue_cents).toBe(4490);
    expect(split.organic.purchases).toBe(1);
  });

  it("reconciles: commercial buckets sum exactly to the commercial total", () => {
    const split = buildSplit([
      row({ acquisition_bucket: "ORGANIC_SEARCH", commercial_included: true, sessions: 4 }),
      row({ acquisition_bucket: "PINTEREST_ORGANIC", commercial_included: true, sessions: 3 }),
      row({ acquisition_bucket: "REFERRAL", commercial_included: true, sessions: 2 }),
      row({ acquisition_bucket: "DIRECT", commercial_included: true, sessions: 1 }),
      row({ acquisition_bucket: "PAID", commercial_included: true, sessions: 5 }),
      row({ acquisition_bucket: "UNKNOWN", commercial_included: false, sessions: 1022 }),
      row({ acquisition_bucket: "INTERNAL", commercial_included: false, sessions: 3 }),
    ]);
    expect(split.commercial.sessions).toBe(15);
    expect(split.organic.sessions).toBe(7);
    expect(split.rawSessions).toBe(1040);
  });
});

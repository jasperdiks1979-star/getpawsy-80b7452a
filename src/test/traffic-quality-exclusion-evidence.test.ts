import { describe, expect, it } from "vitest";
import { classifySession, classifySessions, summarizeTrafficQuality, trafficQualityCsvValues, type ClassifierSession } from "@/lib/trafficQualityClassifier";
import { classifySession as serverClassify, classifySessions as serverBatch } from "../../supabase/functions/_shared/traffic-quality-classifier-v3";
import { buildShadowEligibility } from "@/lib/commercialEligibilityV3";
import { buildShadowEligibility as serverEligibility } from "../../supabase/functions/_shared/commercial-eligibility-v3";
import { commercialSessionCounters, splitCommercialSessions } from "@/lib/commercial-funnel";

const unknown: ClassifierSession = {
  session_id: "unknown", stored_traffic_class_v2: "UNKNOWN",
  classification_reason: "no_signal_no_evidence", stored_exclude_from_commercial: true,
  is_bot: false, stored_is_bot: false, page_views: 1, session_duration_seconds: 0,
  landing_page: "/", device: "desktop",
};

describe("commercial exclusion is not bot evidence", () => {
  const cases: Array<[string, ClassifierSession, string]> = [
    ["UNKNOWN plus exclusion", unknown, "UNKNOWN"],
    ["UNKNOWN without exclusion", { ...unknown, stored_exclude_from_commercial: false }, "UNKNOWN"],
    ["explicit bot overrides human and commerce", { ...unknown, stored_traffic_class_v2: "HUMAN_PROBABLE", is_bot: true, has_checkout: true }, "PROBABLE_BOT_OR_AUTOMATION"],
    ["verified crawler overrides commerce", { ...unknown, crawler_verified: true, has_purchase: true }, "PROBABLE_BOT_OR_AUTOMATION"],
    ["stored bot verdict overrides commerce", { ...unknown, stored_traffic_class_v2: "BOT_CONFIRMED", has_add_to_cart: true }, "PROBABLE_BOT_OR_AUTOMATION"],
    ["technical path overrides commerce", { ...unknown, landing_page: "/api/img/foo", has_checkout: true }, "PROBABLE_BOT_OR_AUTOMATION"],
    ["internal test overrides commerce", { ...unknown, landing_page: "/admin/pinterest-quality", has_checkout: true }, "INTERNAL_OR_TEST"],
    ["UA bot overrides commerce", { ...unknown, user_agent: "Googlebot/2.1", has_checkout: true }, "PROBABLE_BOT_OR_AUTOMATION"],
    ["independent burst remains bot", { ...unknown, page_views: 10, session_duration_seconds: 1 }, "PROBABLE_BOT_OR_AUTOMATION"],
    ["commerce evidence is not vetoed by exclusion metadata", { ...unknown, has_add_to_cart: true }, "PROBABLE_HUMAN"],
  ];
  it.each(cases)("%s: frontend/backend parity", (_label, row, expected) => {
    expect(classifySession(row).traffic_quality_class).toBe(expected);
    expect(serverClassify(row)).toEqual(classifySession(row));
  });
  it("repeated no-evidence UNKNOWN rows remain UNKNOWN in batch, shadow and CSV", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ ...unknown, session_id: `u${i}` }));
    const client = classifySessions(rows);
    expect(serverBatch(rows)).toEqual(client);
    expect(client.every(c => c.traffic_quality_class === "UNKNOWN")).toBe(true);
    expect(client.map(c => trafficQualityCsvValues(c)[0])).toEqual(Array(10).fill("UNKNOWN"));
    const shadow = buildShadowEligibility(rows);
    expect(serverEligibility(rows)).toEqual(shadow);
    expect(shadow.every(r => !r.hard_veto && !r.commercial_eligible_v3_strict && !r.commercial_eligible_v3_expanded)).toBe(true);
    expect(summarizeTrafficQuality(rows).quality.UNKNOWN).toBe(10);
    expect(commercialSessionCounters(rows)).toMatchObject({ sessions: 0, unknown_sessions: 10, excluded_sessions: 0, add_to_cart: 0, purchases: 0 });
  });
  it("hard bot cannot enter downstream KPIs even with an eligible server flag", () => {
    const bot = { ...unknown, is_bot: true, stored_traffic_class_v2: "HUMAN_PROBABLE", has_purchase: true, commercial_eligible_v3_strict: true };
    expect(splitCommercialSessions([bot]).excluded).toHaveLength(1);
    expect(commercialSessionCounters([bot]).purchases).toBe(0);
    expect(buildShadowEligibility([bot])[0]).toMatchObject({ hard_veto: true, commercial_eligible_v3_strict: false });
  });
});
import { describe, it, expect } from "vitest";
import {
  XAI_EVIDENCE_SOURCES,
  EVIDENCE_SOURCE_WEIGHT,
  isValidEvidenceSource,
  normalizeEvidenceSource,
  emptyEvidenceSourceCounts,
  classifyGate,
} from "../../supabase/functions/_shared/evidence-source";

describe("evidence source taxonomy", () => {
  it("exposes all five canonical values", () => {
    expect([...XAI_EVIDENCE_SOURCES].sort()).toEqual(
      ["blended", "heuristic", "insufficient_data", "organic", "paid"].sort(),
    );
  });

  it("weights enforce organic-first priority", () => {
    expect(EVIDENCE_SOURCE_WEIGHT.organic).toBe(1.0);
    expect(EVIDENCE_SOURCE_WEIGHT.blended).toBeLessThan(EVIDENCE_SOURCE_WEIGHT.organic);
    // Paid must be strictly below blended AND below heuristic-adjacent floor
    expect(EVIDENCE_SOURCE_WEIGHT.paid).toBeLessThan(EVIDENCE_SOURCE_WEIGHT.blended);
    expect(EVIDENCE_SOURCE_WEIGHT.paid).toBeLessThanOrEqual(EVIDENCE_SOURCE_WEIGHT.heuristic);
    // insufficient_data must be the lowest — must not drive promotion
    for (const k of XAI_EVIDENCE_SOURCES) {
      if (k !== "insufficient_data") {
        expect(EVIDENCE_SOURCE_WEIGHT[k]).toBeGreaterThan(EVIDENCE_SOURCE_WEIGHT.insufficient_data);
      }
    }
  });

  it("validates and normalises correctly", () => {
    for (const v of XAI_EVIDENCE_SOURCES) {
      expect(isValidEvidenceSource(v)).toBe(true);
      expect(normalizeEvidenceSource(v)).toBe(v);
    }
    expect(isValidEvidenceSource("organic_behaviour")).toBe(false);
    expect(isValidEvidenceSource(null)).toBe(false);
    expect(isValidEvidenceSource(undefined)).toBe(false);
    // Untagged emissions default to heuristic (never organic)
    expect(normalizeEvidenceSource(undefined)).toBe("heuristic");
    expect(normalizeEvidenceSource("bogus")).toBe("heuristic");
  });
});

describe("Council evidence source gate", () => {
  const c = emptyEvidenceSourceCounts;

  it("empty group defaults to heuristic + allow (no promotion asked)", () => {
    const r = classifyGate(c(), "monitor");
    expect(r.decision_evidence_source).toBe("heuristic");
    expect(r.action).toBe("allow");
  });

  it("organic majority allows promotion", () => {
    const counts = { ...c(), organic: 4, paid: 1 };
    const r = classifyGate(counts, "amplify");
    expect(r.decision_evidence_source).toBe("organic");
    expect(r.action).toBe("allow");
  });

  it("paid majority downgrades promotion to validate_only", () => {
    const counts = { ...c(), paid: 4, organic: 1 };
    const r = classifyGate(counts, "amplify");
    expect(r.decision_evidence_source).toBe("paid");
    expect(r.action).toBe("validate_only");
    expect(r.reason).toMatch(/validation-only/);
  });

  it("blended promotion is labelled and validate_only", () => {
    const counts = { ...c(), organic: 2, paid: 2, blended: 1 };
    const r = classifyGate(counts, "amplify");
    expect(r.decision_evidence_source).toBe("blended");
    expect(r.action).toBe("validate_only");
  });

  it("heuristic-only promotion is BLOCKED", () => {
    const counts = { ...c(), heuristic: 5 };
    const r = classifyGate(counts, "amplify");
    expect(r.decision_evidence_source).toBe("heuristic");
    expect(r.action).toBe("block");
  });

  it("insufficient_data ALWAYS blocks promotion", () => {
    const counts = { ...c(), insufficient_data: 3, heuristic: 1 };
    const r = classifyGate(counts, "amplify");
    expect(r.decision_evidence_source).toBe("insufficient_data");
    expect(r.action).toBe("block");
  });

  it("insufficient_data also blocks non-promoting actions", () => {
    const counts = { ...c(), insufficient_data: 3, heuristic: 1 };
    const r = classifyGate(counts, "monitor");
    expect(r.action).toBe("block");
  });

  it("heuristic non-promoting action is allowed (report / diagnose)", () => {
    const counts = { ...c(), heuristic: 5 };
    const r = classifyGate(counts, "monitor");
    expect(r.action).toBe("allow");
  });

  it("untagged votes surface as flag_missing when otherwise allowed", () => {
    const counts = { ...c(), organic: 3 };
    const r = classifyGate(counts, "amplify", { untaggedVotes: 2 });
    expect(r.action).toBe("flag_missing");
    expect(r.reason).toMatch(/missing evidence_source/);
  });

  it("shares are computed against tagged total", () => {
    const counts = { ...c(), organic: 6, paid: 4 };
    const r = classifyGate(counts, "monitor");
    expect(r.organic_share).toBeCloseTo(0.6);
    expect(r.paid_share).toBeCloseTo(0.4);
    expect(r.total_tagged).toBe(10);
  });

  it("REGRESSION: a lone paid vote cannot promote a single-signal group", () => {
    // Corner: only one advisor voted, and it was paid + promoting.
    const counts = { ...c(), paid: 1 };
    const r = classifyGate(counts, "amplify");
    expect(r.action).not.toBe("allow");
  });

  it("REGRESSION: organic + heuristic without paid still allowed if organic >= 60%", () => {
    const counts = { ...c(), organic: 6, heuristic: 4 };
    const r = classifyGate(counts, "amplify");
    expect(r.decision_evidence_source).toBe("organic");
    expect(r.action).toBe("allow");
  });
});

describe("Evidence source coverage — enforcement contract", () => {
  it("normalisation NEVER upgrades an untagged emission to organic", () => {
    for (const bogus of [undefined, null, "", "organic_behaviour", "market", 0, {}, []]) {
      expect(normalizeEvidenceSource(bogus)).not.toBe("organic");
      expect(normalizeEvidenceSource(bogus)).not.toBe("blended");
    }
  });

  it("all five taxonomy values have a defined weight (no accidental drops)", () => {
    for (const v of XAI_EVIDENCE_SOURCES) {
      expect(typeof EVIDENCE_SOURCE_WEIGHT[v]).toBe("number");
    }
  });
});
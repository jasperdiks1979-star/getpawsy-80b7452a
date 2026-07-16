import { describe, it, expect } from "vitest";
import { evaluateIdentityTier, ledgerTierMeta, type TierBSafeguards } from "./pinterest-source-preflight-tier-b.ts";

function safe(overrides: Partial<TierBSafeguards> = {}): TierBSafeguards {
  return {
    identity_confidence: 0.99,
    occupancy_pct: 0.55,
    pdp_similarity: 1.0,
    species_confidence: 0.99,
    animal_visible: true,
    gallery_member: true,
    variant_match: true,
    color_match: true,
    shape_match: true,
    competing_variant_present: false,
    product_obscured: false,
    watermark_present: false,
    supplier_text_present: false,
    collage_present: false,
    decode_pass: true,
    destination_integrity_pass: true,
    product_to_pin_integrity_pass: true,
    ...overrides,
  };
}

describe("evaluateIdentityTier — Tier A", () => {
  it("passes at identity 0.98", () => {
    const r = evaluateIdentityTier(safe({ identity_confidence: 0.98 }));
    expect(r).toEqual({ tier: "A", pass: true, failed: [], reason: null });
  });
  it("Tier A pass does not depend on Tier B flag", () => {
    const r = evaluateIdentityTier(safe({ identity_confidence: 0.985 }), { tierBEnabled: false });
    expect(r.tier).toBe("A");
    expect(r.pass).toBe(true);
  });
  it("fails Tier A at 0.979 with flag OFF (falls into Tier B window then rejects)", () => {
    const r = evaluateIdentityTier(safe({ identity_confidence: 0.979 }), { tierBEnabled: false });
    expect(r.tier).toBe("rejected");
    expect(r.reason).toBe("tier_b_disabled");
  });
  it("Tier A rejects when watermark present", () => {
    const r = evaluateIdentityTier(safe({ watermark_present: true }));
    expect(r.tier).toBe("rejected");
    expect(r.failed).toContain("watermark");
  });
});

describe("evaluateIdentityTier — Tier B window (flag ON)", () => {
  it("passes at 0.95 with every safeguard clean", () => {
    const r = evaluateIdentityTier(safe({ identity_confidence: 0.95 }), { tierBEnabled: true });
    expect(r).toEqual({ tier: "B", pass: true, failed: [], reason: null });
  });
  it("same candidate REJECTS when flag OFF (regression guard)", () => {
    const r = evaluateIdentityTier(safe({ identity_confidence: 0.95 }), { tierBEnabled: false });
    expect(r.tier).toBe("rejected");
    expect(r.reason).toBe("tier_b_disabled");
  });
  it("rejects uncertain gallery membership", () => {
    const r = evaluateIdentityTier(safe({ identity_confidence: 0.95, gallery_member: false }), { tierBEnabled: true });
    expect(r.tier).toBe("rejected");
    expect(r.failed).toContain("not_exact_gallery_member");
  });
  it("rejects variant mismatch", () => {
    const r = evaluateIdentityTier(safe({ identity_confidence: 0.94, variant_match: false }), { tierBEnabled: true });
    expect(r.failed).toContain("variant_mismatch");
  });
  it("rejects color mismatch", () => {
    const r = evaluateIdentityTier(safe({ identity_confidence: 0.93, color_match: false }), { tierBEnabled: true });
    expect(r.failed).toContain("color_mismatch");
  });
  it("rejects supplier text", () => {
    const r = evaluateIdentityTier(safe({ identity_confidence: 0.95, supplier_text_present: true }), { tierBEnabled: true });
    expect(r.failed).toContain("supplier_text");
  });
  it("rejects collage", () => {
    const r = evaluateIdentityTier(safe({ identity_confidence: 0.95, collage_present: true }), { tierBEnabled: true });
    expect(r.failed).toContain("collage");
  });
  it("rejects species below 0.98 when animal visible", () => {
    const r = evaluateIdentityTier(safe({ identity_confidence: 0.95, species_confidence: 0.96 }), { tierBEnabled: true });
    expect(r.failed).toContain("species_below_0.98");
  });
  it("allows animal-absent images without species check", () => {
    const r = evaluateIdentityTier(safe({ identity_confidence: 0.94, animal_visible: false, species_confidence: null }), { tierBEnabled: true });
    expect(r.tier).toBe("B");
  });
  it("rejects occupancy below 0.40", () => {
    const r = evaluateIdentityTier(safe({ identity_confidence: 0.95, occupancy_pct: 0.35 }), { tierBEnabled: true });
    expect(r.failed.some((f) => f.startsWith("occupancy_below"))).toBe(true);
  });
  it("rejects PDP similarity < 1.00", () => {
    const r = evaluateIdentityTier(safe({ identity_confidence: 0.94, pdp_similarity: 0.995 }), { tierBEnabled: true });
    expect(r.failed).toContain("pdp_similarity_not_1_00");
  });
  it("rejects competing variant present", () => {
    const r = evaluateIdentityTier(safe({ identity_confidence: 0.94, competing_variant_present: true }), { tierBEnabled: true });
    expect(r.failed).toContain("competing_variant_present");
  });
  it("rejects destination integrity fail", () => {
    const r = evaluateIdentityTier(safe({ identity_confidence: 0.95, destination_integrity_pass: false }), { tierBEnabled: true });
    expect(r.failed).toContain("destination_integrity_fail");
  });
});

describe("evaluateIdentityTier — below floor", () => {
  it("rejects at identity 0.91 regardless of flag", () => {
    const off = evaluateIdentityTier(safe({ identity_confidence: 0.91 }), { tierBEnabled: false });
    const on  = evaluateIdentityTier(safe({ identity_confidence: 0.91 }), { tierBEnabled: true });
    expect(off.tier).toBe("rejected");
    expect(on.tier).toBe("rejected");
    expect(on.failed[0]).toContain("identity_below");
  });
});

describe("ledgerTierMeta", () => {
  it("records tier + safeguards summary", () => {
    const s = safe({ identity_confidence: 0.95 });
    const ev = evaluateIdentityTier(s, { tierBEnabled: true });
    const meta = ledgerTierMeta(ev, s);
    expect(meta.identity_tier).toBe("B");
    expect(meta.identity_pass).toBe(true);
    expect(meta.identity_confidence).toBe(0.95);
    expect(meta.gallery_member).toBe(true);
  });
});
import { describe, expect, it } from "vitest";
import { assertCompleteEvidence, resolveShadowWindow } from "../../supabase/functions/_shared/shadow-evidence-safety";

describe("shadow evidence read safety", () => {
  it("accepts complete evidence including empty results", () => {
    expect(() => assertCompleteEvidence(0, 0, "activity")).not.toThrow();
    expect(() => assertCompleteEvidence(10, 10, "activity")).not.toThrow();
  });
  it("rejects truncated PostgREST responses below the requested limit", () => {
    expect(() => assertCompleteEvidence(800, 1200, "activity")).toThrow(/incomplete/);
  });
  it("rejects missing exact count", () => {
    expect(() => assertCompleteEvidence(3, null, "crawler")).toThrow(/incomplete/);
  });
  it("rejects inconsistent counts", () => {
    expect(() => assertCompleteEvidence(4, 3, "crawler")).toThrow(/incomplete/);
  });
});

describe("shadow classifier checkpoint safety", () => {
  const now = Date.parse("2026-10-19T12:00:00.000Z");
  it("starts with a fresh bounded window", () => {
    expect(resolveShadowWindow(null, 24, now)).toEqual({
      sinceIso: "2026-10-18T12:00:00.000Z", cursor: "",
    });
  });
  it("resumes using the frozen original window", () => {
    const cp = { hours: 24, since: "2026-10-18T12:00:00.000Z", cursor: "abc" };
    expect(resolveShadowWindow(cp, 24, now)).toEqual({ sinceIso: cp.since, cursor: "abc" });
  });
  it("does not reuse cursor when the window size changes", () => {
    const cp = { hours: 12, since: "2026-10-18T12:00:00.000Z", cursor: "abc" };
    expect(resolveShadowWindow(cp, 24, now).cursor).toBe("");
  });
  it("does not reuse cursor without a valid frozen window", () => {
    expect(resolveShadowWindow({ hours: 24, since: "invalid", cursor: "abc" }, 24, now).cursor).toBe("");
  });
  it("does not resume a checkpoint from a different classifier version", () => {
    const cp = { hours: 24, since: "2026-10-18T12:00:00.000Z", cursor: "abc", version: "v1" };
    expect(resolveShadowWindow(cp, 24, now, "v2").cursor).toBe("");
  });
  it("resumes a checkpoint from the same classifier version", () => {
    const cp = { hours: 24, since: "2026-10-18T12:00:00.000Z", cursor: "abc", version: "v2" };
    expect(resolveShadowWindow(cp, 24, now, "v2").cursor).toBe("abc");
  });
  it("does not reuse a checkpoint older than eight days", () => {
    expect(resolveShadowWindow({ hours: 24, since: "2026-10-01T12:00:00.000Z", cursor: "abc" }, 24, now).cursor).toBe("");
  });
});

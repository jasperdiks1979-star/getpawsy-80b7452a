import { describe, it, expect } from "vitest";
import { computeSourceCounts, buildSourceOptions } from "@/components/admin/DynamicSourceFilter";
import { resolveCanonicalSource, CANONICAL_SOURCES } from "@/lib/canonicalSource";

describe("DynamicSourceFilter — dynamic & future-proof", () => {
  const rows = [
    { utm_source: "pinterest", utm_medium: "social" },
    { utm_source: "pinterest", referrer: "https://www.pinterest.com/" },
    { utm_source: "tiktok" },
    { ttclid: "abc" },
    { utm_source: "google" },
    { referrer: "https://www.reddit.com/" },
    { utm_source: "newsletter", utm_medium: "email" },
    {}, // direct
    { referrer: "https://random-blog.example.com/" }, // referral
    { utm_source: "weirdthing", utm_medium: "qr" }, // unknown
  ];

  it("TikTok appears in options when TikTok traffic exists", () => {
    const counts = computeSourceCounts(rows);
    expect(counts.tiktok).toBeGreaterThanOrEqual(2);
    const opts = buildSourceOptions(counts, { showInactive: false });
    expect(opts.some((o) => o.value === "tiktok")).toBe(true);
  });

  it("Pinterest still behaves identically", () => {
    expect(resolveCanonicalSource({ utm_source: "pinterest" })).toBe("pinterest");
    expect(resolveCanonicalSource({ referrer: "https://www.pinterest.com/" })).toBe("pinterest");
    const counts = computeSourceCounts(rows);
    expect(counts.pinterest).toBe(2);
  });

  it("Unknown sources remain classified as unknown", () => {
    expect(resolveCanonicalSource({ utm_source: "weirdthing", utm_medium: "qr" })).toBe("unknown");
    const counts = computeSourceCounts(rows);
    expect(counts.unknown).toBeGreaterThanOrEqual(1);
  });

  it("Zero-traffic sources are hidden by default", () => {
    const counts = computeSourceCounts(rows);
    const opts = buildSourceOptions(counts, { showInactive: false });
    // No Instagram/LinkedIn/YouTube traffic in `rows`
    expect(opts.some((o) => o.value === "instagram")).toBe(false);
    expect(opts.some((o) => o.value === "linkedin")).toBe(false);
    expect(opts.some((o) => o.value === "youtube")).toBe(false);
  });

  it("Show inactive reveals every canonical source", () => {
    const counts = computeSourceCounts(rows);
    const opts = buildSourceOptions(counts, { showInactive: true });
    for (const s of CANONICAL_SOURCES) {
      expect(opts.some((o) => o.value === s)).toBe(true);
    }
  });

  it("'All Sources' is always first, rest alphabetical", () => {
    const counts = computeSourceCounts(rows);
    const opts = buildSourceOptions(counts, { showInactive: true });
    expect(opts[0].value).toBe("all");
    const labels = opts.slice(1).map((o) => o.label);
    const sorted = [...labels].sort((a, b) => a.localeCompare(b));
    expect(labels).toEqual(sorted);
  });

  it("Classifies extended sources: instagram, reddit, x, linkedin, youtube, paid_ads", () => {
    expect(resolveCanonicalSource({ utm_source: "instagram" })).toBe("instagram");
    expect(resolveCanonicalSource({ referrer: "https://www.instagram.com/" })).toBe("instagram");
    expect(resolveCanonicalSource({ referrer: "https://www.reddit.com/r/cats" })).toBe("reddit");
    expect(resolveCanonicalSource({ utm_source: "x" })).toBe("x");
    expect(resolveCanonicalSource({ referrer: "https://twitter.com/foo" })).toBe("x");
    expect(resolveCanonicalSource({ referrer: "https://www.linkedin.com/" })).toBe("linkedin");
    expect(resolveCanonicalSource({ referrer: "https://youtu.be/abc" })).toBe("youtube");
    expect(resolveCanonicalSource({ utm_source: "demand-gen", utm_medium: "cpc" })).toBe("paid_ads");
  });
});
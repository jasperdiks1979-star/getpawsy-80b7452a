/**
 * Batch B/C/G/H/I regression tests.
 *
 * B — route/navigation uniqueness and no malformed routes
 * C — truth labelling vocabulary on prominent admin surfaces
 * G — monitoring semantics (no false red when there was no activity)
 * H — authorization coverage on internal routes
 * I — storefront/admin boundary (technical routes excluded from analytics/tags)
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { isTechnicalPath } from "@/lib/technicalRoutes";
import { TRUTH_CLASSES, verdictFromCounts } from "@/lib/truthLabels";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const app = read("src/App.tsx");
const adminLayout = read("src/components/admin/AdminLayout.tsx");

describe("B — route uniqueness and integrity", () => {
  const paths = [...app.matchAll(/path="([^"]*)"/g)].map((m) => m[1]);

  it("declares no duplicate route paths", () => {
    const seen = new Set<string>();
    const dupes = paths.filter((p) => (seen.has(p) ? true : (seen.add(p), false)));
    expect(dupes).toEqual([]);
  });

  it("has no pathless (unreachable) <Route> with an element", () => {
    const blocks = app.split("<Route");
    const malformed = blocks
      .slice(1)
      .filter((b) => {
        const head = b.slice(0, b.indexOf("/>") === -1 ? 400 : b.indexOf("/>"));
        return head.includes("element=") && !head.includes("path=") && !head.includes("index");
      });
    expect(malformed.length).toBe(0);
  });

  it("exposes /why-trust-our-reviews (previously an orphan route)", () => {
    expect(paths).toContain("/why-trust-our-reviews");
  });

  it("keeps the previously shadowed admin pages reachable under distinct paths", () => {
    for (const p of [
      "market-intelligence",
      "market-intelligence-suite",
      "product-intelligence",
      "product-intelligence-suite",
      "pinterest-intelligence",
      "pinterest-intelligence-legacy",
      "pinterest-cleanup",
      "pinterest-cleanup-legacy",
      "pinterest-recovery",
      "pinterest-recovery-dashboard",
    ]) {
      expect(paths).toContain(p);
    }
  });

  it("keeps legacy storefront redirects in place", () => {
    expect(paths).toContain("/shipping-policy");
    expect(paths).toContain("/privacy-policy");
  });

  it("admin sidebar has no duplicate nav targets", () => {
    const tos = [...adminLayout.matchAll(/\{ to: '([^']+)'/g)].map((m) => m[1]);
    const seen = new Set<string>();
    const dupes = tos.filter((t) => (seen.has(t) ? true : (seen.add(t), false)));
    expect(dupes).toEqual([]);
  });
});

describe("I — storefront/admin boundary", () => {
  const technical = [
    "/admin",
    "/admin/tracking-health",
    "/dashboard",
    "/live-map",
    "/founder-mode",
    "/merchant-fix-checklist",
    "/pinterest-tag-health",
    "/debug/perf",
    "/diagnostics/headers",
    "/__ops/growth-verification",
  ];
  const commercial = ["/", "/products", "/products/some-slug", "/cart", "/checkout", "/collections/dog", "/blog/post"];

  it.each(technical)("treats %s as a technical route", (p) => {
    expect(isTechnicalPath(p)).toBe(true);
  });

  it.each(commercial)("keeps %s commercial", (p) => {
    expect(isTechnicalPath(p)).toBe(false);
  });

  it("keeps the edge mirror of the technical-route list in sync", () => {
    const clientList = read("src/lib/technicalRoutes.ts");
    const edgeList = read("supabase/functions/_shared/technical-routes.ts");
    const extract = (s: string, marker: string) =>
      s.slice(s.indexOf(marker)).slice(0, s.slice(s.indexOf(marker)).indexOf("];"));
    expect(extract(edgeList, "TECHNICAL_PREFIXES")).toContain("/diagnostics/");
    expect(extract(clientList, "TECHNICAL_PREFIXES")).toContain("/diagnostics/");
    for (const token of ["/dashboard", "/live-map", "/founder-mode", "/merchant-fix-checklist", "/__ops"]) {
      expect(clientList).toContain(token);
      expect(edgeList).toContain(token);
    }
  });

  it("the Pinterest tag never fires on technical routes", () => {
    const src = read("src/components/tracking/SafePinterestTag.tsx");
    expect(src).toContain("isTechnicalPath");
    expect(src).toContain("if (technical) return;");
  });

  it("no global legacy link/fetch monkeypatching remains in the storefront runtime", () => {
    expect(existsSync(resolve(root, "src/lib/legacy-link-guard.ts"))).toBe(false);
    expect(app).not.toContain("initLegacyFetchGuard");
    expect(app).not.toContain("legacy-link-guard");
  });
});

describe("H — authorization coverage on internal routes", () => {
  it("guards internal ops/diagnostic routes with the centralized guard", () => {
    for (const path of ["/__ops/growth-verification", "/merchant-fix-checklist", "/dashboard", "/live-map", "/debug/perf"]) {
      const idx = app.indexOf(`path="${path}"`);
      expect(idx, `${path} route missing`).toBeGreaterThan(-1);
      const block = app.slice(idx, idx + 500);
      expect(block, `${path} is not wrapped in AdminOnly`).toContain("<AdminOnly>");
    }
  });

  it("AdminOnly delegates to the server-verified AdminRouteGuard", () => {
    const src = read("src/components/auth/AdminOnly.tsx");
    expect(src).toContain("./AdminRouteGuard");
    expect(src).not.toMatch(/@?[\w.]+@[\w.]+\.\w+/);
  });
});

describe("C — truth labelling", () => {
  it("defines every provenance class exactly once", () => {
    const ids = Object.keys(TRUTH_CLASSES);
    expect(ids.sort()).toEqual(
      ["broken_monitor", "diagnostic", "heuristic", "legacy_truth", "live_truth", "mock", "simulation"].sort(),
    );
    for (const id of ids) {
      expect(TRUTH_CLASSES[id as keyof typeof TRUTH_CLASSES].label.length).toBeGreaterThan(0);
    }
  });

  it("labels the edge-function probe as DIAGNOSTIC, not a success claim", () => {
    const src = read("src/pages/admin/EdgeFunctionsHealthPage.tsx");
    expect(src).toContain('truth="diagnostic"');
    expect(src).toContain("Boots OK");
    expect(src).not.toContain("> Success");
  });

  it("labels the tracking heartbeat as live truth", () => {
    expect(read("src/pages/admin/TrackingHealth.tsx")).toContain('truth="live_truth"');
  });
});

describe("G — monitoring no-activity semantics", () => {
  it("reports no_activity instead of fail when nothing happened", () => {
    expect(verdictFromCounts({ activityInWindow: 0, observed: 0 })).toBe("no_activity");
    expect(verdictFromCounts({ activityInWindow: 10, observed: 0 })).toBe("fail");
    expect(verdictFromCounts({ activityInWindow: 10, observed: 3 })).toBe("pass");
    expect(verdictFromCounts({ activityInWindow: 10, observed: 0, required: false })).toBe("unknown");
  });

  it("Tracking Health gates required events on real storefront activity", () => {
    const src = read("src/pages/admin/TrackingHealth.tsx");
    expect(src).toContain("storefrontActivity");
    expect(src).toContain("no_activity");
    expect(src).toContain("conditionMet = context.storefrontActivity > 0;");
  });

  it("analytics-canonical supports the full 90d window and reports clamping", () => {
    const src = read("supabase/functions/analytics-canonical/index.ts");
    expect(src).toContain("MAX_WINDOW_HOURS = 24 * 90");
    expect(src).toContain("window_hours_requested");
    expect(src).toContain("window_clamped");
    expect(src).not.toContain("hours = Math.min(hours, 24 * 30);");
  });

  it("cache freshness stays visible in the envelope", () => {
    const src = read("supabase/functions/analytics-canonical/index.ts");
    for (const field of ["cache_status", "cache_generated_at", "cache_age_seconds", "cache_stale"]) {
      expect(src).toContain(field);
    }
  });
});

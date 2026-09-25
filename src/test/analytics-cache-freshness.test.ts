import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { evaluateCacheFreshness, freshMsFor, maxStaleMsFor } from "@/lib/analyticsCacheFreshness";
import { freshnessDisplay } from "@/components/admin/CacheFreshnessBadge";

const NOW = Date.parse("2026-09-25T09:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const server = readFileSync("supabase/functions/analytics-canonical/index.ts", "utf8");

describe("freshness thresholds", () => {
  it("per-window cadence and fallback", () => {
    expect(freshMsFor(1)).toBe(5 * MIN);
    expect(freshMsFor(168)).toBe(5 * MIN);
    expect(freshMsFor(336)).toBe(10 * MIN);
    expect(freshMsFor(720)).toBe(15 * MIN);
    expect(freshMsFor(2160)).toBe(30 * MIN);
    expect(maxStaleMsFor(24)).toBe(30 * MIN);
    expect(maxStaleMsFor(720)).toBe(60 * MIN);
    expect(maxStaleMsFor(2160)).toBe(120 * MIN);
  });
});

describe("states", () => {
  it("fresh", () => {
    const v = evaluateCacheFreshness({ hours: 24, generatedAt: ago(2 * MIN), now: NOW });
    expect(v.state).toBe("fresh"); expect(v.isCurrent).toBe(true); expect(v.shouldRefresh).toBe(false);
  });
  it("stale triggers refresh", () => {
    const v = evaluateCacheFreshness({ hours: 720, generatedAt: ago(20 * MIN), now: NOW });
    expect(v.state).toBe("stale"); expect(v.isCurrent).toBe(false); expect(v.shouldRefresh).toBe(true);
  });
  it("11-Sept snapshot is fallback / NOT CURRENT, never current", () => {
    const v = evaluateCacheFreshness({ hours: 720, generatedAt: "2026-09-11T17:53:07Z", now: NOW });
    expect(v.state).toBe("fallback"); expect(v.isCurrent).toBe(false);
    expect(v.label).toMatch(/NOT CURRENT/);
    expect(freshnessDisplay({ cache_generated_at: "2026-09-11T17:53:07Z" }, 720, NOW).display).toBe("NOT CURRENT");
  });
  it("missing", () => {
    expect(evaluateCacheFreshness({ hours: 24, generatedAt: null, now: NOW }).state).toBe("missing");
    expect(freshnessDisplay({}, 24, NOW).display).toBe("MISSING");
  });
  it("client last-known-good copy is FALLBACK even if young", () => {
    expect(freshnessDisplay({ cache_generated_at: ago(MIN), served_from_client_cache: true }, 24, NOW).display).toBe("FALLBACK");
  });
  it("no over-age snapshot is ever current (sweep)", () => {
    for (const h of [1, 24, 168, 336, 720, 2160]) {
      for (let m = 0; m < 20000; m += 7) {
        const v = evaluateCacheFreshness({ hours: h, generatedAt: ago(m * MIN), now: NOW });
        if (m * MIN > freshMsFor(h)) expect(v.isCurrent).toBe(false);
      }
    }
  });
});

describe("refresh observability + stampede guard", () => {
  it("CPU-killed attempt (running, lease expired) flags failing", () => {
    const v = evaluateCacheFreshness({
      hours: 720, generatedAt: ago(40 * MIN), now: NOW,
      lastRefreshAttemptAt: ago(10 * MIN), lockedUntil: ago(6 * MIN),
    });
    expect(v.refreshFailing).toBe(true); expect(v.shouldRefresh).toBe(true);
  });
  it("in-flight lock suppresses duplicate refresh", () => {
    const v = evaluateCacheFreshness({
      hours: 720, generatedAt: ago(40 * MIN), now: NOW,
      lockedUntil: new Date(NOW + 2 * MIN).toISOString(),
    });
    expect(v.refreshInProgress).toBe(true); expect(v.shouldRefresh).toBe(false);
  });
  it("server records attempt atomically with the conditional lock", () => {
    expect(server).toMatch(/update\(\{ locked_until: until, last_refresh_attempt_at: nowIso, last_refresh_status: "running" \}\)/);
    expect(server).toMatch(/locked_until\.is\.null,locked_until\.lt\./);
    expect(server).toMatch(/last_refresh_status: err \? "error" : "ok"/);
  });
  it("every background rebuild goes through acquireLock", () => {
    const bg = server.match(/try \{ await refreshKey\(opts\); \}/g) ?? [];
    const guarded = server.match(/if \(!\(await acquireLock\(key\)\)\)[^\n]*\n\s*try \{ await refreshKey\(opts\); \}/g) ?? [];
    expect(bg.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(bg.length);
  });
});

describe("server wiring + 30d serialization regression", () => {
  it("uses shared contract, labels every served snapshot", () => {
    expect(server).toContain('from "../_shared/analyticsCacheFreshness.ts"');
    expect(server).toContain("cache_freshness_state: v.state");
    expect(server).toContain('cache_stale: meta.cache === "stale" || !v.isCurrent');
  });
  it("warmer refresh returns compact ack, not the full payload", () => {
    expect(server).toMatch(/if \(!wantFull\) return json\(refreshAck\(payload, hours, geo\)\)/);
    expect(server).not.toMatch(/const payload = await refreshKey\(opts\);\s*return json\(withCacheMeta/);
  });
  it("time budget / scan wave preserved", () => {
    expect(server).toContain("const COMPUTE_BUDGET_MS = 90_000;");
    expect(server).toContain("const SCAN_WAVE = 3;");
  });
  it("shared module mirror is identical", () => {
    const a = readFileSync("src/lib/analyticsCacheFreshness.ts", "utf8");
    const b = readFileSync("supabase/functions/_shared/analyticsCacheFreshness.ts", "utf8");
    const cut = (s: string) => s.slice(s.indexOf("export type CacheFreshnessState"));
    expect(cut(a)).toBe(cut(b));
  });
});

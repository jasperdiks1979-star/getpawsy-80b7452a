import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const GUARD_CALL = "requireInternalOrAdmin(req)";

describe("Security A — edge function authorization", () => {
  const fns = [
    "supabase/functions/create-cj-order/index.ts",
    "supabase/functions/audit-warehouse-shipping/index.ts",
    "supabase/functions/analytics-health-probe/index.ts",
    "supabase/functions/visitor-map-stabilization-monitor/index.ts",
  ];

  it.each(fns)("%s imports the shared guard", (p) => {
    const src = read(p);
    expect(src).toContain('from "../_shared/admin-guard.ts"');
    expect(src).toContain(GUARD_CALL);
  });

  it.each(fns)("%s runs the guard before any privileged work", (p) => {
    const src = read(p);
    const guardAt = src.indexOf(GUARD_CALL);
    expect(guardAt).toBeGreaterThan(0);

    // Every privileged/third-party operation inside the request handler must
    // come after the guard call.
    const handlerStart = Math.min(
      ...[src.indexOf("serve(async (req)"), src.indexOf("Deno.serve(async (req)")].filter(
        (i) => i >= 0,
      ),
    );
    const risky = [
      "SUPABASE_SERVICE_ROLE_KEY",
      "CJ_API_KEY",
      "cjdropshipping.com",
      ".insert(",
      ".update(",
      "functions.invoke(",
    ];
    for (const token of risky) {
      let from = handlerStart;
      for (;;) {
        const at = src.indexOf(token, from);
        if (at < 0) break;
        expect(at, `${token} must appear after the guard in ${p}`).toBeGreaterThan(guardAt);
        from = at + token.length;
      }
    }
  });

  it("registers the newly guarded functions in the canonical registry", () => {
    const registry = read("supabase/functions/_shared/guarded-functions.ts");
    for (const name of [
      "create-cj-order",
      "audit-warehouse-shipping",
      "analytics-health-probe",
      "visitor-map-stabilization-monitor",
    ]) {
      expect(registry).toContain(`"${name}"`);
    }
  });

  it("server-to-server callers authenticate with the internal secret", () => {
    const webhook = read("supabase/functions/stripe-webhook/index.ts");
    const at = webhook.indexOf("functions/v1/create-cj-order");
    expect(at).toBeGreaterThan(0);
    expect(webhook.slice(at, at + 600)).toContain("x-internal-secret");
  });

  it("admin UI calls the guarded warehouse audit with an authenticated invoke", () => {
    const admin = read("src/pages/Admin.tsx");
    expect(admin).not.toContain("functions/v1/audit-warehouse-shipping");
    expect(admin).toContain("supabase.functions.invoke(\n            'audit-warehouse-shipping'");
  });
});

describe("Security A — stabilization caller contract", () => {
  const src = read("supabase/functions/visitor-map-stabilization-monitor/index.ts");

  it("sends analytics-canonical the hours/geo request shape", () => {
    expect(src).toContain('body: { hours, geo: "all" }');
    expect(src).not.toContain("body: { timeRange }");
  });

  it("reads the canonical totals/diagnostics response shape", () => {
    expect(src).toContain("payload?.totals");
    expect(src).toContain("t.add_to_cart");
    expect(src).toContain("t.checkout_started");
    expect(src).toContain("payload?.diagnostics?.sessions_with_geo");
  });

  it("maps the monitored windows to hour counts", () => {
    expect(src).toContain('"24h": 24');
    expect(src).toContain('"7d": 24 * 7');
    expect(src).toContain('"30d": 24 * 30');
  });
});

describe("Security A — client route guarding", () => {
  const app = read("src/App.tsx");

  const guardedPaths = [
    "/dashboard",
    "/admin/e2e-verify",
    "/admin/analytics/visitor-world-map-pro",
    "/admin/analytics/canary-v2",
    "/admin/analytics/visitor-world-map-pro/stabilization",
    "/admin/stripe-test-checkout",
    "/live-map",
    "/debug/perf",
  ];

  it.each(guardedPaths)("%s is wrapped in AdminOnly", (path) => {
    const at = app.indexOf(`path="${path}"`);
    expect(at).toBeGreaterThan(0);
    const block = app.slice(at, at + 400);
    expect(block).toContain("<AdminOnly>");
  });

  it("guards every /diagnostics route", () => {
    const paths = [...app.matchAll(/path="(\/diagnostics\/[^"]+)"/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(5);
    for (const p of paths) {
      const at = app.indexOf(`path="${p}"`);
      expect(app.slice(at, at + 400), `${p} must be admin-only`).toContain("<AdminOnly>");
    }
  });

  it("AdminOnly delegates to the centralized AdminRouteGuard", () => {
    const guard = read("src/components/auth/AdminOnly.tsx");
    expect(guard).toContain("./AdminRouteGuard");
    expect(guard).toContain("AdminRouteGuard");
  });

  it("QA page no longer uses a hardcoded email allowlist as a boundary", () => {
    const qa = read("src/pages/admin/AdminE2eVerify.tsx");
    expect(qa).not.toMatch(/ADMIN_ALLOWLIST/);
    expect(qa).not.toMatch(/[\w.+-]+@(hotmail|gmail|outlook)\.com/);
    expect(qa).not.toContain("signInWithPassword");
    expect(qa).not.toContain("signInWithOtp");
  });
});

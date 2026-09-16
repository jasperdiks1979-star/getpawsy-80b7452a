import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const fn = (name: string) => read(`supabase/functions/${name}/index.ts`);

// Security B — the four critical "reachable without login" findings.
// 1) automation orchestrator  → aci-orchestrator
// 2) blog link rewriter       → add-internal-links-to-blogs
// 3) analytics endpoint       → analytics-canonical (revenue + visitor geo)
// 4) Genesis certification    → genesis-omega-* / genesis-v15-twin / adaptive wave
const SHARED_GUARDED = [
  "aci-orchestrator",
  "add-internal-links-to-blogs",
  "analytics-canonical",
  "genesis-omega-board",
  "genesis-omega-boardroom-certify",
  "genesis-omega-infinity",
  "genesis-omega-perpetual",
  "genesis-omega-truth",
  "genesis-v15-twin",
  "genesis-golden-adaptive-wave",
];

describe("Security B — anonymous access is denied", () => {
  it.each(SHARED_GUARDED)("%s imports and calls the shared guard", (name) => {
    const src = fn(name);
    expect(src).toMatch(/from ['"]\.\.\/_shared\/admin-guard\.ts['"]/);
    expect(src).toMatch(/requireInternalOrAdmin\(req/);
  });

  it.each(SHARED_GUARDED)("%s runs the guard before any privileged work", (name) => {
    const src = fn(name);
    const guardAt = src.search(/requireInternalOrAdmin\(req/);
    expect(guardAt).toBeGreaterThan(0);
    const handlerStart = Math.min(
      ...[src.indexOf("Deno.serve(async (req)"), src.indexOf("serve(async (req)")].filter(
        (i) => i >= 0,
      ),
    );
    for (const token of ["SUPABASE_SERVICE_ROLE_KEY", ".insert(", ".update(", "functions/v1/"]) {
      let from = handlerStart;
      for (;;) {
        const at = src.indexOf(token, from);
        if (at < 0) break;
        expect(at, `${token} must appear after the guard in ${name}`).toBeGreaterThan(guardAt);
        from = at + token.length;
      }
    }
  });

  it("genesis-omega-architect verifies an admin role server-side and fails closed", () => {
    const src = fn("genesis-omega-architect");
    const jwtAt = src.indexOf('req.headers.get("Authorization")');
    expect(jwtAt).toBeGreaterThan(0);
    expect(src).toContain('.from("user_roles")');
    expect(src).toContain('.eq("role", "admin")');
    expect(src).toContain('status: 401');
    expect(src).toContain('status: 403');
    // No privileged read/write before the role check completes.
    const roleAt = src.indexOf('.from("user_roles")');
    expect(src.indexOf("exec_readonly_sql")).toBeGreaterThan(roleAt);
  });

  it("the guard fails closed on missing/invalid credentials", () => {
    const guard = read("supabase/functions/_shared/admin-guard.ts");
    expect(guard).toContain('reason: "missing_bearer"');
    expect(guard).toContain("status: 401");
    // An empty configured secret can never be matched by an empty header.
    expect(guard).toContain("INTERNAL_SECRET && provided && provided === INTERNAL_SECRET");
  });
});

describe("Security B — sensitive analytics data is not anonymously readable", () => {
  const src = fn("analytics-canonical");

  it("guards the revenue/geo endpoint before it touches orders or sessions", () => {
    const guardAt = src.indexOf("requireInternalOrAdmin(req)");
    expect(guardAt).toBeGreaterThan(0);
    // The guard is the first statement of the request handler, so every
    // in-handler data access is necessarily behind it.
    const handlerStart = src.indexOf("Deno.serve(async (req)");
    expect(handlerStart).toBeGreaterThan(0);
    expect(guardAt).toBeGreaterThan(handlerStart);
    const between = src.slice(handlerStart, guardAt);
    for (const token of ['from("orders")', 'from("canonical_events")', 'from("visitor_activity")']) {
      expect(between, `${token} must be behind the guard`).not.toContain(token);
    }
  });

  it("the cron warmer authenticates with an internal secret, never anonymously", () => {
    const warmer = fn("analytics-canonical-warmer");
    expect(warmer).toContain('req.headers.get("x-internal-secret")');
    expect(warmer).toContain('status: 401');
    expect(warmer).toContain("INTERNAL_FUNCTION_SECRET");
  });

  it("the CSV export stays behind its admin gate", () => {
    const exp = fn("analytics-canonical-export-v2");
    expect(exp).toContain("checkCanonicalV2Gate(req)");
  });
});

describe("Security B — mapped legitimate callers keep working", () => {
  it("admin dashboards call analytics-canonical through the authenticated client", () => {
    const hook = read("src/hooks/useCanonicalFunnel.ts");
    expect(hook).toContain('supabase.functions.invoke("analytics-canonical"');
    expect(hook).not.toContain("fetch(`${");
  });

  it("the automation orchestrator is invoked from the admin page via an authenticated invoke", () => {
    const page = read("src/pages/admin/AutonomousCommercePage.tsx");
    expect(page).toContain('supabase.functions.invoke("aci-orchestrator"');
    expect(page).not.toContain("functions/v1/aci-orchestrator");
  });

  it("the blog link rewriter has no anonymous/public caller", () => {
    const page = read("src/pages/admin/GenesisOmegaArchitectPage.tsx");
    expect(page).toContain('supabase.functions.invoke("genesis-omega-architect"');
  });

  it("all Security B functions are listed in the canonical guarded registry", () => {
    const registry = read("supabase/functions/_shared/guarded-functions.ts");
    for (const name of [...SHARED_GUARDED, "genesis-omega-architect"]) {
      expect(registry).toContain(`"${name}"`);
    }
  });
});

describe("Security B — no secrets in client code", () => {
  it("no service-role key or internal secret is referenced from src/", () => {
    const client = read("src/integrations/supabase/client.ts");
    expect(client).not.toContain("SERVICE_ROLE");
    expect(client).not.toContain("INTERNAL_FUNCTION_SECRET");
  });
});

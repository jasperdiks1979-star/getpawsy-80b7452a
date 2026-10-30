import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Guard against a new E2E spec bypassing the shared synthetic-session fixture.
 * The fixture sets the marker before any application JavaScript runs, so
 * browser tests cannot contaminate commercial analytics when pointed at live.
 */
describe("Playwright synthetic-traffic isolation contract", () => {
  const directory = resolve(process.cwd(), "e2e");
  const specs = readdirSync(directory).filter((name) => name.endsWith(".spec.ts"));

  it("all browser specs use the shared marked fixture", () => {
    expect(specs.length).toBeGreaterThan(0);
    for (const name of specs) {
      const source = readFileSync(resolve(directory, name), "utf8");
      expect(source, name).toMatch(/from\s*["']\.\.\/playwright-fixture["']/);
      const imports = source.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']@playwright\/test["']/g);
      for (const [, members] of imports) {
        expect(members, `${name}: test/expect must come from shared fixture`)
          .not.toMatch(/\b(?:test|expect)\b/);
      }
    }
  });

  it("the shared fixture installs its marker before app scripts", () => {
    const source = readFileSync(resolve(process.cwd(), "playwright-fixture.ts"), "utf8");
    expect(source).toContain("context.addInitScript");
    expect(source).toContain('sessionStorage.setItem("gp_synthetic_traffic_v1", "playwright-e2e")');
  });
});

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Phase 9 — Pinterest Market Intelligence", () => {
  const fnPath = path.join(process.cwd(), "supabase/functions/pinterest-market-intelligence/index.ts");
  const pagePath = path.join(process.cwd(), "src/pages/admin/PinterestMarketIntelligencePage.tsx");

  it("ships an edge function", () => {
    expect(fs.existsSync(fnPath)).toBe(true);
    const src = fs.readFileSync(fnPath, "utf8");
    expect(src).toContain("market_trending_products");
    expect(src).toContain("market_opportunity_gaps");
    expect(src).toContain("pinterest_competitor_patterns");
    expect(src).toContain("market_ai_recommendations");
    // Read-only: no inserts / updates / deletes
    expect(/\.insert\(|\.update\(|\.delete\(/.test(src)).toBe(false);
  });

  it("registers admin page and route", () => {
    expect(fs.existsSync(pagePath)).toBe(true);
    const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
    expect(app).toContain("PinterestMarketIntelligencePage");
    expect(app).toContain("pinterest-market-intelligence");
  });
});
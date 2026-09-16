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
    // The engine persists its OWN intelligence tables (opportunities, run audit,
    // XAI decisions) but must never mutate the upstream signal sources it reads.
    const READ_ONLY_SOURCES = [
      "pinterest_trend_signals",
      "pmin_keyword_trends",
      "market_trend_clusters",
      "pinterest_competitor_patterns",
      "pinterest_competitor_opportunities",
      "pinterest_pin_performance",
    ];
    for (const table of READ_ONLY_SOURCES) {
      const mutation = new RegExp(
        `from\\(["'\`]${table}["'\`]\\)[\\s\\S]{0,200}?\\.(insert|upsert|update|delete)\\(`,
      );
      expect(mutation.test(src), `${table} must not be mutated`).toBe(false);
    }
  });


  it("registers admin page and route", () => {
    expect(fs.existsSync(pagePath)).toBe(true);
    const app = fs.readFileSync(path.join(process.cwd(), "src/App.tsx"), "utf8");
    expect(app).toContain("PinterestMarketIntelligencePage");
    expect(app).toContain("pinterest-market-intelligence");
  });
});
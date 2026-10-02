import { describe, it, expect } from "vitest";
import { claimCrawlerLog, isPublicStorefrontPath, CRAWLER_LOGGED_KEY } from "@/lib/crawlerCoverage";

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

describe("crawler coverage", () => {
  it("covers public storefront routes", () => {
    for (const p of ["/", "/products", "/products/abc", "/collections/cat-trees", "/guides/how-to-clean-cat-litter-box", "/cart", "/checkout"]) expect(isPublicStorefrontPath(p)).toBe(true);
  });
  it("excludes admin/auth/internal/technical and page-level appeal routes", () => {
    for (const p of ["/admin", "/admin/x", "/dashboard", "/auth", "/account/orders", "/api/img/x", "/robots.txt", "/sitemap.xml", "/google-review", "/appeal-response", "/technical-declaration"]) expect(isPublicStorefrontPath(p)).toBe(false);
  });
  it("logs once per session across SPA navigation", () => {
    const s = mem();
    expect(claimCrawlerLog("/", "sid1", s)).toBe(true);
    expect(claimCrawlerLog("/products/a", "sid1", s)).toBe(false);
    expect(claimCrawlerLog("/guides/x", "sid1", s)).toBe(false);
    expect(s.getItem(CRAWLER_LOGGED_KEY)).toBe("sid1");
    expect(claimCrawlerLog("/", "sid2", s)).toBe(true); // new session → new log
  });
  it("admin first page does not consume the session claim", () => {
    const s = mem();
    expect(claimCrawlerLog("/admin", "sid1", s)).toBe(false);
    expect(claimCrawlerLog("/", "sid1", s)).toBe(true);
  });
  it("fails closed without session or storage", () => {
    expect(claimCrawlerLog("/", null, mem())).toBe(false);
    expect(claimCrawlerLog("/", "sid", null)).toBe(false);
  });
});

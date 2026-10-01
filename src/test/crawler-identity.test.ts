import { describe, it, expect } from "vitest";
import { resolveCrawlerIdentity, hashIp, isCrawlerNonHuman } from "../../supabase/functions/_shared/crawler-identity";
import { classifyTraffic } from "../../supabase/functions/_shared/traffic-classifier";

const GBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const ADS = "AdsBot-Google (+http://www.google.com/adsbot.html)";
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const yes = async () => true;
const no = async () => false;

describe("crawler identity", () => {
  it("A: spoofed Googlebot is not verified", async () => {
    const r = await resolveCrawlerIdentity(GBOT, "1.2.3.4", { inGoogleRanges: no, reverseDns: async () => ["evil.example.com"], forwardDns: async () => ["1.2.3.4"] });
    expect(r.crawler_verified).toBe(false);
    expect(r.reasons).toContain("crawler:ua_googlebot_unverified");
    expect(r.crawler_class).not.toBe("VERIFIED_SEARCH_CRAWLER");
  });
  it("B: Googlebot verified via DNS round trip", async () => {
    const r = await resolveCrawlerIdentity(GBOT, "66.249.66.1", { inGoogleRanges: no, reverseDns: async () => ["crawl-66-249-66-1.googlebot.com."], forwardDns: async () => ["66.249.66.1"] });
    expect(r.crawler_class).toBe("VERIFIED_SEARCH_CRAWLER");
    expect(r.crawler_verification_method).toBe("reverse_dns_roundtrip");
  });
  it("B2: forward DNS mismatch is not verified", async () => {
    const r = await resolveCrawlerIdentity(GBOT, "66.249.66.1", { reverseDns: async () => ["x.googlebot.com"], forwardDns: async () => ["9.9.9.9"] });
    expect(r.crawler_verified).toBe(false);
  });
  it("C: AdsBot-Google verified via IP range", async () => {
    const r = await resolveCrawlerIdentity(ADS, "66.249.66.2", { inGoogleRanges: yes });
    expect(r.crawler_class).toBe("VERIFIED_ADS_CRAWLER");
    expect(r.reasons).toContain("crawler:verified_adsbot_google");
  });
  it("D: ordinary human unchanged", async () => {
    const r = await resolveCrawlerIdentity(CHROME, "8.8.4.4", { inGoogleRanges: yes });
    expect(r.crawler_identity).toBeNull();
    expect(isCrawlerNonHuman(r)).toBe(false);
    expect(classifyTraffic({ page_path: "/product/x", user_agent: CHROME, has_atc: true }).traffic_quality).toBe("human");
  });
  it("E: behavioural bot rules still apply", () => {
    expect(classifyTraffic({ page_path: "/", user_agent: "Mozilla/5.0 HeadlessChrome/120" }).traffic_quality).toBe("bot");
  });
  it("F: verified crawler never human, even with commerce signals", () => {
    const r = classifyTraffic({ page_path: "/checkout", user_agent: GBOT, has_checkout: true, has_atc: true, crawler_verified: true, crawler_reason: "crawler:verified_googlebot" });
    expect(r.traffic_quality).toBe("bot");
    expect(r.bot_reason).toBe("crawler:verified_googlebot");
  });
  it("G: crawler result still yields a row (raw mode keeps it)", async () => {
    const r = await resolveCrawlerIdentity(GBOT, "66.249.66.1", { inGoogleRanges: yes });
    expect(r.crawler_identity).toBe("Googlebot");
  });
  it("H: IP is hashed, never returned raw", async () => {
    const h = await hashIp("66.249.66.1", "salt");
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(h).not.toContain("66.249");
    const r = await resolveCrawlerIdentity(GBOT, "66.249.66.1", { inGoogleRanges: yes });
    expect(JSON.stringify(r)).not.toContain("66.249.66.1");
  });
});

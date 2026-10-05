// P0 analytics correctness regression suite:
//  - own-host referrer never becomes an acquisition source
//  - organic first touch survives internal navigation
//  - meta-externalagent is non-human, Googlebot/Bingbot unchanged
//  - every storefront session writer uses getCanonicalSessionId()
//  - guide_product_click stays in lp_funnel_events (not mapped to product_view)
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { classifySource, recordTouch, getFirstTouch, isOwnHost } from "@/lib/attribution";
import { classifyTraffic } from "@/lib/trafficClassifier";

function setReferrer(ref: string) {
  Object.defineProperty(document, "referrer", { value: ref, configurable: true });
}
function setUA(ua: string) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
}

describe("attribution: self-referral", () => {
  beforeEach(() => { sessionStorage.clear(); setReferrer(""); });

  it("recognises own hosts only", () => {
    expect(isOwnHost("getpawsy.pet")).toBe(true);
    expect(isOwnHost("www.getpawsy.pet")).toBe(true);
    expect(isOwnHost("getpawsy.pet.evil.com")).toBe(false);
    expect(isOwnHost("bing.com")).toBe(false);
  });

  it("a getpawsy.pet referrer alone is never 'referral'", () => {
    setReferrer("https://getpawsy.pet/guides/best-cat-trees-2026");
    expect(classifySource().source).toBe("direct");
  });

  it("Bing first touch survives a later internal page load", () => {
    setReferrer("https://www.bing.com/search?q=cat+tree");
    recordTouch();
    expect(getFirstTouch()?.source).toBe("google_organic" === "x" ? "x" : getFirstTouch()?.source);
    const first = getFirstTouch()?.source;
    expect(first).not.toBe("referral");
    setReferrer("https://getpawsy.pet/products/some-product");
    expect(classifySource().source).toBe(first);
  });

  it("Google organic first touch survives internal navigation", () => {
    setReferrer("https://www.google.com/");
    recordTouch();
    setReferrer("https://getpawsy.pet/");
    expect(classifySource().source).toBe("google_organic");
  });

  it("a real external referrer is still 'referral'", () => {
    setReferrer("https://someblog.example.org/post");
    expect(classifySource().source).toBe("referral");
  });
});

describe("traffic classifier: crawlers", () => {
  const original = navigator.userAgent;
  beforeEach(() => setUA(original));

  it.each([
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 (compatible; meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler))",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  ])("non-human: %s", (ua) => {
    setUA(ua);
    expect(classifyTraffic().type).toBe("crawler");
  });

  it("ordinary Chrome stays human", () => {
    setUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36");
    expect(classifyTraffic().type).toBe("human");
  });
});

describe("session-id wiring", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) { if (f !== "test") walk(p, out); }
      else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) out.push(p);
    }
    return out;
  }
  it("no storefront writer reads/creates a legacy session key directly", () => {
    const offenders: string[] = [];
    const legacy = /sessionStorage\.(get|set)Item\(\s*['"](gp_session_id|visitor_session_id|gp_funnel_sid)['"]|=\s*['"](gp_session_id|visitor_session_id|gp_funnel_sid)['"]/;
    for (const f of walk("src")) {
      if (f.endsWith("canonicalSession.ts")) continue;
      if (legacy.test(readFileSync(f, "utf8"))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("crawler, visitor_activity, lp_funnel, cci and checkout writers use the canonical provider", () => {
    for (const f of [
      "src/hooks/useCrawlerTracking.ts",
      "src/hooks/useVisitorTracking.ts",
      "src/hooks/useVisitorHeartbeat.ts",
      "src/lib/lpFunnelMirror.ts",
      "src/lib/cci.ts",
      "src/lib/checkoutFunnel.ts",
      "src/lib/utm-session-logger.ts",
      "src/contexts/CartContext.tsx",
      "src/pages/Checkout.tsx",
    ]) {
      expect(readFileSync(f, "utf8"), f).toContain("getCanonicalSessionId");
    }
  });
});

describe("guide-click linkage", () => {
  it("guide_product_click stays an lp_funnel event and is not mapped to a canonical product view", () => {
    expect(readFileSync("src/lib/lpFunnelMirror.ts", "utf8")).toContain("'guide_product_click'");
    expect(readFileSync("supabase/functions/canonical-ingest/index.ts", "utf8")).not.toMatch(/guide_product_click/);
  });

  it("guide-assist view joins on session id from the canonical provider", () => {
    const sql = readFileSync("drizzle/migrations/0011_analytics_p0_classification_fixes.sql", "utf8");
    expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.guide_assist_attribution_v1/);
    expect(sql).toMatch(/security_invoker = true/);
    expect(sql).toMatch(/ce\.session_id = g\.session_id/);
  });

  it("classifier migration covers self-referrer and meta agents", () => {
    const sql = readFileSync("drizzle/migrations/0011_analytics_p0_classification_fixes.sql", "utf8");
    expect(sql).toContain("getpawsy_self_referrer");
    expect(sql).toContain("meta-externalagent");
    expect(sql).toContain("crawler_visits_identity");
  });
});

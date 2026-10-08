import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { cciSourceDedupKey } from "../../supabase/functions/_shared/canonicalDedup";
import { emptyPartial, foldEvents } from "../../supabase/functions/_shared/canonicalIngest";
import { classifySession } from "@/lib/trafficQualityClassifier";
import { classifySession as classifyServer } from "../../supabase/functions/_shared/traffic-quality-classifier-v3";
import { inferUtm, referrerHostname, isFirstPartyHost } from "@/lib/utmNormalizer";
import { resolveSessionDurationSeconds } from "@/lib/sessionDuration";

const ev = (o: Record<string, unknown>) => ({
  canonical_name: "CANONICAL_PAGE_VIEW", session_id: "s1", page_path: "/",
  occurred_at: "2026-10-08T10:00:00.000Z", source_system: "cci", ...o,
});

describe("P0 ingest idempotency", () => {
  it("edge key mirrors SQL concat_ws (NULL session skipped, empty product kept)", () => {
    expect(cciSourceDedupKey({ id: "e1", session_id: "s1", canonical: "CANONICAL_PAGE_VIEW", product_id: null }))
      .toBe("cci|e1|s1|CANONICAL_PAGE_VIEW|");
    expect(cciSourceDedupKey({ id: "e1", session_id: null, canonical: "CANONICAL_ADD_TO_CART", product_id: "p" }))
      .toBe("cci|e1|CANONICAL_ADD_TO_CART|p");
  });
  it("same source row ingested twice counts once; genuine repeats are kept", () => {
    const p = emptyPartial("a", "b");
    foldEvents(p, [
      ev({ source_event_id: "e1" }),
      ev({ source_event_id: "e1" }), // duplicate ingest
      ev({ source_event_id: "e2", occurred_at: "2026-10-08T10:05:00.000Z" }), // real repeat
    ], () => "DIRECT");
    expect(p.raw_events).toBe(3);
    expect(p.sessions.s1.page_views).toBe(2);
  });
  it("page_view + homepage_view of one page load (within 5s) is one view", () => {
    const p = emptyPartial("a", "b");
    foldEvents(p, [
      ev({ source_event_id: "a1", occurred_at: "2026-10-08T10:00:00.000Z" }),
      ev({ source_event_id: "a2", occurred_at: "2026-10-08T10:00:01.500Z" }),
    ], () => "DIRECT");
    expect(p.sessions.s1.page_views).toBe(1);
  });
  it("add_to_cart click + success stay one ATC flag (no inflation)", () => {
    const p = emptyPartial("a", "b");
    foldEvents(p, [
      ev({ canonical_name: "CANONICAL_ADD_TO_CART", source_event_id: "c1", product_id: "x" }),
      ev({ canonical_name: "CANONICAL_ADD_TO_CART", source_event_id: "c2", product_id: "x" }),
    ], () => "DIRECT");
    expect(p.sessions.s1.has_add_to_cart).toBe(true);
    expect(p.sessions.s1.page_views).toBe(0);
  });
});

describe("P0 GARE", () => {
  const src = readFileSync("supabase/functions/gare-orchestrator/index.ts", "utf8");
  it("queries the real timestamp column", () => {
    expect(src).not.toContain('"event_ts"');
    expect(src).toContain('.gte("occurred_at", since)');
  });
  it("a failed probe never auto-triggers recovery and is not reported as an ingest halt", () => {
    expect(src).toMatch(/probeFailed = d\.severity === "unknown"/);
    expect(src).toMatch(/auto_safe = !probeFailed/);
    expect(src).toContain("detection query error (not an ingest halt)");
  });
  it("recovery success requires HTTP ok AND body ok", () => {
    expect(src).toContain("canonical-ingest?hours=1");
    expect(src).toMatch(/if \(!r\.ok \|\| !bodyOk\) outcome = "failed"/);
  });
});

describe("P0 stored bot verdict precedence", () => {
  const botCheckout = {
    session_id: "se1", country: "SE", user_agent: "", page_views: 3,
    has_add_to_cart: true, has_checkout: true, is_bot: false,
    stored_traffic_class_v2: "BOT_CONFIRMED", stored_exclude_from_commercial: true, stored_is_bot: false,
  };
  it.each([["client", classifySession], ["server", classifyServer]])("%s: BOT_CONFIRMED checkout is never human", (_n, fn) => {
    expect((fn as typeof classifySession)(botCheckout as any).traffic_quality_class).toBe("PROBABLE_BOT_OR_AUTOMATION");
  });
  it("exclude_from_commercial alone excludes; stored internal wins", () => {
    expect(classifySession({ session_id: "x", has_checkout: true, stored_exclude_from_commercial: true } as any).traffic_quality_class)
      .toBe("PROBABLE_BOT_OR_AUTOMATION");
    expect(classifySession({ session_id: "y", stored_traffic_class_v2: "INTERNAL_PREVIEW" } as any).traffic_quality_class)
      .toBe("INTERNAL_OR_TEST");
  });
  it("missing UA / UNKNOWN / ?cb= are NOT automatic bots", () => {
    const c = classifySession({
      session_id: "z", user_agent: "", landing_page: "/?cb=1791409010366", stored_traffic_class_v2: "UNKNOWN",
      page_views: 1,
    } as any);
    expect(c.classification_reasons.some((r) => r.startsWith("stored_"))).toBe(false);
    expect(c.traffic_quality_class).not.toBe("INTERNAL_OR_TEST");
  });
});

describe("P1 attribution", () => {
  it("parses hostnames and recognizes bare duckduckgo.com", () => {
    expect(referrerHostname("https://duckduckgo.com/")).toBe("duckduckgo.com");
    expect(inferUtm({ externalReferrer: "https://duckduckgo.com/", internalReferrer: "" }))
      .toMatchObject({ utm_source: "duckduckgo", utm_medium: "organic" });
  });
  it("first-party referrer is never 'referral'", () => {
    expect(isFirstPartyHost("www.getpawsy.pet")).toBe(true);
    const r = inferUtm({ externalReferrer: "https://getpawsy.pet/", internalReferrer: "" });
    expect(r.utm_source).not.toBe("referral");
  });
  it("real external referrer still 'referral'", () => {
    expect(inferUtm({ externalReferrer: "https://somepetblog.example/post", internalReferrer: "" }))
      .toMatchObject({ utm_source: "referral" });
  });
});

describe("Exports parity + duration", () => {
  const src = readFileSync("src/components/admin/VisitorWorldMap.tsx", "utf8");
  it("summary states scope/snapshot and raw vs shoppers; CSV filename carries the same scope", () => {
    expect(src).toContain("Alleen VS");
    expect(src).toContain("waarvan shoppers (strict v3)");
    expect(src).toMatch(/rijen\.csv/);
  });
  it("CSV and summary share the duration resolver", () => {
    expect((src.match(/resolveSessionDurationSeconds\(s\)/g) ?? []).length).toBe(2);
    expect(resolveSessionDurationSeconds({ effective_duration_seconds: 119, reported_duration_seconds: 0 })).toBe(119);
  });
});

describe("Payment integrity untouched", () => {
  it("purchase dedup key stays order/session anchored", async () => {
    const { semanticDedupKey } = await import("../../supabase/functions/_shared/canonicalDedup");
    expect(semanticDedupKey({ source: "cci", canonical: "CANONICAL_PURCHASE", session_id: "s", occurred_at: "2026-01-01T00:00:00Z" }))
      .toBe("cci|CANONICAL_PURCHASE|s");
  });
});

import { aggregateBuckets, classifyRow, totalsFromAggregate } from "./canonicalV2Buckets.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const CUTOFF = "2026-07-17T23:20:00Z";

Deno.test("classifyRow: internal wins over everything", () => {
  assertEquals(classifyRow({ is_internal: true, technical_path: "/api/x", is_bot: true, traffic_quality: "human", ingested_at: "2026-07-18T00:00:00Z" }, CUTOFF), "internal");
});

Deno.test("classifyRow: technical route above human", () => {
  assertEquals(classifyRow({ technical_path: "/api/health", traffic_quality: "human", ingested_at: "2026-07-18T00:00:00Z" }, CUTOFF), "technical");
});

Deno.test("classifyRow: bot only when confidence >= 0.7", () => {
  assertEquals(classifyRow({ is_bot: true, bot_confidence: 0.6, traffic_quality: "human", ingested_at: "2026-07-18T00:00:00Z" }, CUTOFF), "human");
  assertEquals(classifyRow({ is_bot: true, bot_confidence: 0.9, traffic_quality: "human", ingested_at: "2026-07-18T00:00:00Z" }, CUTOFF), "bot");
});

Deno.test("classifyRow: crawler/uncertain/human via traffic_quality", () => {
  assertEquals(classifyRow({ traffic_quality: "crawler", ingested_at: "2026-07-18T00:00:00Z" }, CUTOFF), "crawler");
  assertEquals(classifyRow({ traffic_quality: "uncertain", ingested_at: "2026-07-18T00:00:00Z" }, CUTOFF), "uncertain");
  assertEquals(classifyRow({ traffic_quality: "human", ingested_at: "2026-07-18T00:00:00Z" }, CUTOFF), "human");
});

Deno.test("classifyRow: pre-cutoff, no classification → legacy_unclassified", () => {
  assertEquals(classifyRow({ ingested_at: "2026-07-17T22:00:00Z" }, CUTOFF), "legacy_unclassified");
});

Deno.test("classifyRow: post-cutoff, no classification → uncertain (never human)", () => {
  assertEquals(classifyRow({ ingested_at: "2026-07-18T01:00:00Z" }, CUTOFF), "uncertain");
});

Deno.test("aggregateBuckets: session worst-bucket precedence — technical hit on human session demotes to technical", () => {
  const rows = [
    { session_id: "s1", visitor_id: "v1", ingested_at: "2026-07-18T00:00:00Z", traffic_quality: "human" },
    { session_id: "s1", visitor_id: "v1", ingested_at: "2026-07-18T00:00:01Z", technical_path: "/api/img" },
  ];
  const agg = aggregateBuckets(rows, CUTOFF);
  assertEquals(agg.sessions.technical.size, 1);
  assertEquals(agg.sessions.human.size, 0);
});

Deno.test("totalsFromAggregate: raw = sum of buckets; commercial = human + uncertain", () => {
  const rows = [
    { session_id: "h", visitor_id: "h", ingested_at: "2026-07-18T00:00:00Z", traffic_quality: "human" },
    { session_id: "u", visitor_id: "u", ingested_at: "2026-07-18T00:00:00Z", traffic_quality: "uncertain" },
    { session_id: "c", visitor_id: "c", ingested_at: "2026-07-18T00:00:00Z", traffic_quality: "crawler" },
    { session_id: "b", visitor_id: "b", ingested_at: "2026-07-18T00:00:00Z", is_bot: true, bot_confidence: 0.95 },
    { session_id: "t", visitor_id: "t", ingested_at: "2026-07-18T00:00:00Z", technical_path: "/api/health" },
    { session_id: "i", visitor_id: "i", ingested_at: "2026-07-18T00:00:00Z", is_internal: true },
    { session_id: "l", visitor_id: "l", ingested_at: "2026-07-17T00:00:00Z" },
  ];
  const t = totalsFromAggregate(aggregateBuckets(rows, CUTOFF));
  assertEquals(t.raw_sessions, 7);
  const sum = t.human_sessions + t.uncertain_sessions + t.crawler_sessions + t.bot_sessions + t.technical_sessions + t.internal_sessions + t.legacy_unclassified_sessions;
  assertEquals(sum, 7);
  assertEquals(t.commercial_sessions, t.human_sessions + t.uncertain_sessions);
  assertEquals(t.crawler_sessions, 1);
  assertEquals(t.technical_sessions, 1);
  assertEquals(t.internal_sessions, 1);
  assertEquals(t.legacy_unclassified_sessions, 1);
});

Deno.test("rollback safety: v1 numbers not mutated by v2 aggregation", () => {
  // v2 is a pure function over rows; running it does not touch source objects.
  const rows = [{ session_id: "s", visitor_id: "v", ingested_at: "2026-07-18T00:00:00Z", traffic_quality: "human" }];
  const before = JSON.stringify(rows);
  aggregateBuckets(rows, CUTOFF);
  assertEquals(JSON.stringify(rows), before);
});

Deno.test("parity: technical never appears in commercial", () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({
    session_id: `s${i}`, visitor_id: `v${i}`, ingested_at: "2026-07-18T00:00:00Z",
    technical_path: i % 2 === 0 ? "/api/x" : null,
    traffic_quality: i % 2 === 0 ? "human" : "human",
  }));
  const t = totalsFromAggregate(aggregateBuckets(rows, CUTOFF));
  assertEquals(t.technical_sessions, 100);
  assertEquals(t.human_sessions, 100);
  assertEquals(t.commercial_sessions, 100);
});
import { test } from "node:test";
import assert from "node:assert/strict";
import { isUS, inspectGeoParityWindows } from "./analytics-parity-window-diagnostics.mjs";

const row = (session_id, last_seen_at, country = "US") => ({ session_id, last_seen_at, country });
const envelope = (since, until, sessions, cache_generated_at = until) => ({
  window: { since, until },
  sessions,
  cache_generated_at,
  cache_status: "hit",
  cache_age_seconds: 15,
});

test("normalizes the same US country variants as the canonical edge function", () => {
  for (const value of ["US", "usa", "U.S.", "u.s.a.", "United States", "united states of america"]) {
    assert.equal(isUS(value), true, value);
  }
  assert.equal(isUS("Canada"), false);
});

test("different cache windows show boundary-only drift without leaking session IDs", () => {
  const us = envelope("2026-10-29T10:15:00Z", "2026-10-30T10:15:00Z", [
    row("shared", "2026-10-30T10:00:00Z"),
  ]);
  const all = envelope("2026-10-29T10:00:00Z", "2026-10-30T10:00:00Z", [
    row("shared", "2026-10-30T10:00:00Z"),
    row("boundary", "2026-10-29T10:05:00Z"),
    row("non-us", "2026-10-29T10:30:00Z", "CA"),
  ]);
  const d = inspectGeoParityWindows(us, all);
  assert.equal(d.start_skew_seconds, 900);
  assert.equal(d.end_skew_seconds, 900);
  assert.equal(d.overlap_us_count, 1);
  assert.equal(d.overlap_all_us_count, 1);
  assert.equal(d.overlap_missing_from_us_count, 0);
  assert.equal(d.overlap_extra_in_us_count, 0);
  assert.equal(JSON.stringify(d).includes("shared"), false);
  assert.equal(JSON.stringify(d).includes("boundary"), false);
});

test("missing US session inside identical window remains a real mismatch", () => {
  const since = "2026-10-29T10:00:00Z", until = "2026-10-30T10:00:00Z";
  const us = envelope(since, until, [row("present", "2026-10-30T09:00:00Z")]);
  const all = envelope(since, until, [
    row("present", "2026-10-30T09:00:00Z"),
    row("missing", "2026-10-30T09:10:00Z", "United States"),
  ]);
  const d = inspectGeoParityWindows(us, all);
  assert.equal(d.start_skew_seconds, 0);
  assert.equal(d.overlap_missing_from_us_count, 1);
  assert.equal(d.overlap_extra_in_us_count, 0);
});

test("invalid or non-overlapping windows report uncertainty, never false parity", () => {
  const invalid = inspectGeoParityWindows({ sessions: [] }, { sessions: [] });
  assert.equal(invalid.overlap, null);
  assert.equal(invalid.overlap_us_count, null);
  const nonoverlap = inspectGeoParityWindows(
    envelope("2026-10-29T00:00:00Z", "2026-10-29T01:00:00Z", []),
    envelope("2026-10-29T02:00:00Z", "2026-10-29T03:00:00Z", []),
  );
  assert.equal(nonoverlap.overlap, null);
  assert.equal(nonoverlap.overlap_missing_from_us_count, null);
});

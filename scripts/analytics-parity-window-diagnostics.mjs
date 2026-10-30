/**
 * Read-only diagnostics for the independently warmed US and all geo caches.
 * These are intentionally NOT a parity waiver: the live probe must still fail
 * on any unexplained mismatch until both geo views share a fixed snapshot.
 * Never log visitor/session identifiers.
 */
export function isUS(country) {
  const c = String(country || "").trim().toLowerCase();
  return new Set(["us", "usa", "u.s.", "u.s.a.", "united states", "united states of america"]).has(c);
}

function validWindow(envelope) {
  const since = envelope?.window?.since;
  const until = envelope?.window?.until;
  const startMs = Date.parse(since || "");
  const endMs = Date.parse(until || "");
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return { since, until, startMs, endMs };
}

export function inspectGeoParityWindows(usEnvelope, allEnvelope) {
  const us = validWindow(usEnvelope);
  const all = validWindow(allEnvelope);
  const summary = {
    us_window: us ? { since: us.since, until: us.until } : null,
    all_window: all ? { since: all.since, until: all.until } : null,
    us_cache_generated_at: usEnvelope?.cache_generated_at ?? null,
    all_cache_generated_at: allEnvelope?.cache_generated_at ?? null,
    us_cache_status: usEnvelope?.cache_status ?? null,
    all_cache_status: allEnvelope?.cache_status ?? null,
    us_cache_age_seconds: usEnvelope?.cache_age_seconds ?? null,
    all_cache_age_seconds: allEnvelope?.cache_age_seconds ?? null,
    start_skew_seconds: us && all ? (Math.round((us.startMs - all.startMs) / 1000) || 0) : null,
    end_skew_seconds: us && all ? (Math.round((us.endMs - all.endMs) / 1000) || 0) : null,
    overlap: null,
    overlap_us_count: null,
    overlap_all_us_count: null,
    overlap_missing_from_us_count: null,
    overlap_extra_in_us_count: null,
  };
  if (!us || !all) return summary;
  const start = Math.max(us.startMs, all.startMs);
  const end = Math.min(us.endMs, all.endMs);
  if (end <= start) return summary;
  summary.overlap = { since: new Date(start).toISOString(), until: new Date(end).toISOString() };
  const inside = (s) => {
    const seen = Date.parse(s?.last_seen_at || "");
    return Number.isFinite(seen) && seen >= start && seen <= end;
  };
  const usIds = new Set((usEnvelope.sessions || []).filter(inside).map((s) => s.session_id));
  const allUsIds = new Set((allEnvelope.sessions || []).filter((s) => isUS(s.country) && inside(s)).map((s) => s.session_id));
  summary.overlap_us_count = usIds.size;
  summary.overlap_all_us_count = allUsIds.size;
  summary.overlap_missing_from_us_count = [...allUsIds].filter((id) => !usIds.has(id)).length;
  summary.overlap_extra_in_us_count = [...usIds].filter((id) => !allUsIds.has(id)).length;
  return summary;
}

/**
 * Strict, privacy-safe comparison of independently warmed geo envelopes.
 * A passing result requires an identical (not rounded-to-seconds) window,
 * matching US session identities and matching counts. An inconclusive
 * comparison is never silently treated as a pass.
 */
export function assessGeoParity(usEnvelope, allEnvelope) {
  const windows = inspectGeoParityWindows(usEnvelope, allEnvelope);
  const expected = (allEnvelope?.sessions || []).filter((s) => isUS(s.country)).length;
  const actual = (usEnvelope?.sessions || []).length;
  const validWindows = windows.us_window !== null && windows.all_window !== null;
  const sameWindow = validWindows &&
    windows.us_window.since === windows.all_window.since &&
    windows.us_window.until === windows.all_window.until;
  const identitiesMatch = windows.overlap !== null &&
    windows.overlap_missing_from_us_count === 0 &&
    windows.overlap_extra_in_us_count === 0;
  const countsMatch = actual === expected;
  const reason = !validWindows ? "invalid_window" :
    !sameWindow ? "window_skew" :
    !identitiesMatch ? "session_identity_mismatch" :
    !countsMatch ? "session_count_mismatch" : "ok";
  return { ok: reason === "ok", reason, expected, actual, windows };
}

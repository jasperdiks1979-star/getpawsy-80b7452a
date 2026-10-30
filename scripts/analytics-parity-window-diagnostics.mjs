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
    start_skew_seconds: us && all ? Math.round((us.startMs - all.startMs) / 1000) : null,
    end_skew_seconds: us && all ? Math.round((us.endMs - all.endMs) / 1000) : null,
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

// Single shared storefront session-id provider.
// Purpose: unify session_id across visitor_activity, cci_events,
// checkout_funnel_events and canonical_events so bot classification joins work.
//
// Rules:
//   - sessionStorage-backed uuid v4 ("gp_canonical_sid")
//   - 30 min inactivity timeout -> new sid
//   - no fingerprinting, no PII, no new cookies
//   - additive: legacy per-writer sid stays intact for back-compat

const KEY_SID = "gp_canonical_sid";
const KEY_LAST = "gp_canonical_sid_last";
const INACTIVITY_MS = 30 * 60 * 1000;

// Legacy per-writer session-id keys — every writer historically kept its
// own namespace, which meant analytics-canonical could not join across
// tables. Phase 4A unifies them: canonicalSession is the single source
// of truth, and it mirrors the chosen sid into every legacy key so that
// (a) existing sessions are NOT rotated mid-visit, and (b) any writer
// that still reads a legacy key transparently receives the canonical sid.
const LEGACY_KEYS = [
  "gp_session_id",       // cci_events, analyticsFunnel, engagementStart, sessionQuality, pinterestTracker, funnelEvents, homepagePersonalization, lpFunnelMirror
  "visitor_session_id",  // useVisitorTracking (visitor_activity), utm-session-logger
  "gp_funnel_sid",       // checkoutFunnel (checkout_funnel_events)
];

function uuidv4(): string {
  try {
    const g = (globalThis as any).crypto;
    if (g?.randomUUID) return g.randomUUID();
  } catch { /* ignore */ }
  return "sid-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function safeStorage(): Storage | null {
  try { return typeof window !== "undefined" ? window.sessionStorage : null; } catch { return null; }
}

function mirrorToLegacy(s: Storage, sid: string): void {
  for (const k of LEGACY_KEYS) {
    try {
      const existing = s.getItem(k);
      if (existing !== sid) s.setItem(k, sid);
    } catch { /* ignore per-key failure */ }
  }
}

function adoptExistingSid(s: Storage): string | null {
  // Priority preserves the most established/interacted namespace so we
  // don't rotate a mid-visit session.
  for (const k of [KEY_SID, ...LEGACY_KEYS]) {
    try {
      const v = s.getItem(k);
      if (v && v.length >= 8) return v;
    } catch { /* ignore */ }
  }
  return null;
}

export function getCanonicalSessionId(): string {
  const s = safeStorage();
  const now = Date.now();
  if (!s) return uuidv4();
  try {
    const last = Number(s.getItem(KEY_LAST) || "0");
    let sid = s.getItem(KEY_SID);
    if (!sid) sid = adoptExistingSid(s);
    if (!sid || (last && now - last > INACTIVITY_MS)) {
      sid = uuidv4();
    }
    s.setItem(KEY_SID, sid);
    mirrorToLegacy(s, sid);
    s.setItem(KEY_LAST, String(now));
    return sid;
  } catch {
    return uuidv4();
  }
}

export function peekCanonicalSessionId(): string | null {
  const s = safeStorage();
  if (!s) return null;
  try { return s.getItem(KEY_SID); } catch { return null; }
}

export const CANONICAL_SID_KEY = KEY_SID;
export const CANONICAL_SID_INACTIVITY_MS = INACTIVITY_MS;
export const CANONICAL_LEGACY_KEYS = LEGACY_KEYS;

/** Test-only: force a fresh session (does not touch UUID-per-event contracts). */
export function _resetCanonicalSessionForTests(): void {
  const s = safeStorage(); if (!s) return;
  try {
    s.removeItem(KEY_SID); s.removeItem(KEY_LAST);
    for (const k of LEGACY_KEYS) s.removeItem(k);
  } catch { /* ignore */ }
}
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

export function getCanonicalSessionId(): string {
  const s = safeStorage();
  const now = Date.now();
  if (!s) return uuidv4();
  try {
    const last = Number(s.getItem(KEY_LAST) || "0");
    let sid = s.getItem(KEY_SID);
    if (!sid || !last || now - last > INACTIVITY_MS) {
      sid = uuidv4();
      s.setItem(KEY_SID, sid);
    }
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
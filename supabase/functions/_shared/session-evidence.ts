// Deterministic session evidence aggregation. Browser labels are never proof of human traffic.
export interface ActivityEvidence {
  session_id: string;
  browser?: string | null;
  is_internal?: boolean | null;
  is_admin_path?: boolean | null;
  is_bot_suspect?: boolean | null;
  bot_suspect_reason?: string | null;
}
export interface VerifiedCrawlerEvidence {
  session_id: string;
  crawler_verified: boolean;
}
export interface SessionEvidence {
  is_internal: boolean;
  is_admin_path: boolean;
  is_bot_suspect: boolean;
  bot_suspect_reason: string | null;
  crawler_verified: boolean;
  crawler_reason: string | null;
}
const STRONG = new Set([
  "known_crawler_ua", "synthetic_monitor", "headless_browser",
  "automation_signal", "declared_bot", "malformed_ua_no_interaction",
]);
export function aggregateSessionEvidence(
  activity: ActivityEvidence[],
  verifiedCrawlers: VerifiedCrawlerEvidence[],
): Map<string, SessionEvidence> {
  const evidence = new Map<string, SessionEvidence>();
  const ensure = (id: string): SessionEvidence => {
    let value = evidence.get(id);
    if (!value) {
      value = {
        is_internal: false, is_admin_path: false, is_bot_suspect: false,
        bot_suspect_reason: null, crawler_verified: false, crawler_reason: null,
      };
      evidence.set(id, value);
    }
    return value;
  };
  for (const a of activity) {
    if (!a.session_id) continue;
    const h = ensure(a.session_id);
    h.is_internal ||= a.is_internal === true;
    h.is_admin_path ||= a.is_admin_path === true;
    h.is_bot_suspect ||= a.is_bot_suspect === true;
    if (a.is_bot_suspect === true && a.bot_suspect_reason) {
      if (!h.bot_suspect_reason ||
        (STRONG.has(a.bot_suspect_reason) && !STRONG.has(h.bot_suspect_reason)) ||
        (STRONG.has(a.bot_suspect_reason) === STRONG.has(h.bot_suspect_reason) &&
          a.bot_suspect_reason < h.bot_suspect_reason)) {
        h.bot_suspect_reason = a.bot_suspect_reason;
      }
    }
  }
  for (const c of verifiedCrawlers) {
    if (!c.session_id || c.crawler_verified !== true) continue;
    const h = ensure(c.session_id);
    h.crawler_verified = true;
    h.crawler_reason = "crawler:verified";
  }
  return evidence;
}

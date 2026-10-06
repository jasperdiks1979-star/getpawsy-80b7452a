// commercialLivePresence — who may be counted as a live SHOPPER in the
// customer/commercial "Now online" metric.
//
// This is a REPORTING filter only. It never mutates, deletes or reclassifies
// stored session/event data; technical and unverified sessions stay in the
// raw/forensic count so investigations keep full visibility.
//
// Rules (exclusion always wins):
//   technical  — internal, bot-suspect, verified crawler, or a stored class of
//                VERIFIER / AUTOMATION / BOT_* / CRAWLER* / INTERNAL* / TECHNICAL.
//   commercial — HUMAN_PROBABLE / HUMAN_CONFIRMED with valid geo or a
//                meaningful event; UNKNOWN / unclassified ONLY when it has a
//                meaningful event (product_view, add_to_cart, view_cart,
//                checkout, purchase or recorded interaction) AND valid geo.
//                A pageview alone never promotes unknown traffic to human.
//   unverified — everything else (e.g. UNKNOWN, missing geo, zero interaction).

export type LiveSessionVerdict = "commercial" | "technical" | "unverified";

export interface LiveSessionEvidence {
  traffic_class?: string | null;
  crawler_verified?: boolean | null;
  is_internal?: boolean | null;
  is_bot_suspect?: boolean | null;
  country?: string | null;
  has_product_view?: boolean | null;
  has_add_to_cart?: boolean | null;
  has_view_cart?: boolean | null;
  has_checkout?: boolean | null;
  has_purchase?: boolean | null;
  interaction_count?: number | null;
  /** Raw visitor_activity activity_type (browsing | cart | checkout). */
  activity_type?: string | null;
}

const HUMAN_CLASSES = new Set(["HUMAN_PROBABLE", "HUMAN_CONFIRMED"]);
const INVALID_GEO = new Set(["", "UNKNOWN", "XX", "ZZ", "??", "-", "N/A", "NULL", "T1"]);

export function isTechnicalClass(cls: string | null | undefined): boolean {
  const c = String(cls ?? "").toUpperCase();
  if (!c) return false;
  return (
    c === "VERIFIER" ||
    c === "AUTOMATION" ||
    c === "TECHNICAL" ||
    c.startsWith("BOT") ||
    c.startsWith("CRAWLER") ||
    c.startsWith("INTERNAL")
  );
}

export function hasValidGeo(country: string | null | undefined): boolean {
  return !INVALID_GEO.has(String(country ?? "").trim().toUpperCase());
}

export function hasMeaningfulEvent(s: LiveSessionEvidence): boolean {
  const act = String(s.activity_type ?? "").toLowerCase();
  return (
    !!s.has_product_view ||
    !!s.has_add_to_cart ||
    !!s.has_view_cart ||
    !!s.has_checkout ||
    !!s.has_purchase ||
    (typeof s.interaction_count === "number" && s.interaction_count > 0) ||
    act === "cart" ||
    act === "checkout"
  );
}

export function classifyLiveSession(s: LiveSessionEvidence): LiveSessionVerdict {
  if (s.is_internal === true || s.is_bot_suspect === true || s.crawler_verified === true) return "technical";
  if (isTechnicalClass(s.traffic_class)) return "technical";

  const cls = String(s.traffic_class ?? "").toUpperCase();
  const geo = hasValidGeo(s.country);
  const meaningful = hasMeaningfulEvent(s);

  if (HUMAN_CLASSES.has(cls)) return geo || meaningful ? "commercial" : "unverified";
  return meaningful && geo ? "commercial" : "unverified";
}

export function isCommercialLiveSession(s: LiveSessionEvidence): boolean {
  return classifyLiveSession(s) === "commercial";
}

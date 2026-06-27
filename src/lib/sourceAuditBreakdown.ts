/**
 * Source audit breakdown.
 *
 * Pure helpers used by the Visitor World Map and the
 * `pinterest-traffic-audit` tests. Given a raw, unfiltered list of
 * visitor_activity rows (i.e. BEFORE the World Map's `Exclude internal/test`
 * and `US only` toggles), it produces:
 *
 *   1. An enriched per-source breakdown that splits visitors into
 *      external_clean / internal / bot / preview_prefetch / us / non_us.
 *      This makes it impossible for the World Map to silently hide
 *      Pinterest "ghost" traffic just because a filter is toggled.
 *
 *   2. A Pinterest-only drilldown with country / pin_id / campaign /
 *      landing-page splits, a conversion funnel, and a set of warnings
 *      ("Pinterest has traffic but 0 US visitors", etc).
 *
 * All inputs are optional / nullable to match the database shape.
 * The helpers never mutate `rows`.
 */

import { resolveCanonicalSource, CANONICAL_SOURCES, type CanonicalSource } from "./canonicalSource";

export type VisitorRow = {
  session_id: string;
  visitor_id?: string | null;
  country?: string | null;
  city?: string | null;
  page_path?: string | null;
  referrer?: string | null;
  referrer_category?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  is_internal?: boolean | null;
  is_bot_suspect?: boolean | null;
  bot_suspect_reason?: string | null;
  traffic_quality?: string | null;
  activity_type?: string | null;
  device_type?: string | null;
  browser?: string | null;
};

export type RowClass = "external_clean" | "internal" | "bot" | "preview_prefetch";

const US_COUNTRIES = new Set(["United States", "USA", "US", "U.S.", "U.S.A."]);

export function isUsCountry(country?: string | null): boolean {
  return !!country && US_COUNTRIES.has(country);
}

/** Priority: bot > internal > preview/prefetch > external_clean. */
export function classifyRow(r: VisitorRow): RowClass {
  const tq = (r.traffic_quality ?? "").toLowerCase();
  const reason = (r.bot_suspect_reason ?? "").toLowerCase();
  if (r.is_bot_suspect === true || tq === "bot" || tq === "crawler") return "bot";
  if (r.is_internal === true || tq === "internal") return "internal";
  if (
    tq === "pre_render" || tq === "prerender" || tq === "prefetch" ||
    reason.includes("prefetch") || reason.includes("prerender")
  ) return "preview_prefetch";
  return "external_clean";
}

export function canonicalOf(r: VisitorRow): CanonicalSource {
  return resolveCanonicalSource({
    utm_source: r.utm_source ?? null,
    utm_medium: r.utm_medium ?? null,
    utm_campaign: r.utm_campaign ?? null,
    referrer: r.referrer ?? null,
    referrer_category: r.referrer_category ?? null,
    page_path: r.page_path ?? null,
  });
}

export type EnrichedSourceRow = {
  source: CanonicalSource;
  visitors: number;
  pageviews: number;
  external_clean: number;
  internal: number;
  bot: number;
  preview_prefetch: number;
  us: number;
  non_us: number;
};

/**
 * Build per-canonical-source breakdown. Counts UNIQUE sessions in each bucket
 * (so a row of 10 events from the same Pinterest session counts once for
 * `visitors` and the matching class/geo bucket) but counts every row in
 * `pageviews`.
 */
export function buildEnrichedBreakdown(rows: VisitorRow[]): EnrichedSourceRow[] {
  type Bucket = {
    visitors: Set<string>;
    pageviews: number;
    classBySession: Map<string, RowClass>;
    usBySession: Map<string, boolean>;
  };
  const map = new Map<CanonicalSource, Bucket>();
  for (const s of CANONICAL_SOURCES) {
    map.set(s, { visitors: new Set(), pageviews: 0, classBySession: new Map(), usBySession: new Map() });
  }
  const classPriority: Record<RowClass, number> = {
    bot: 4, internal: 3, preview_prefetch: 2, external_clean: 1,
  };
  for (const r of rows) {
    const src = canonicalOf(r);
    const b = map.get(src)!;
    b.visitors.add(r.session_id);
    b.pageviews += 1;
    const cls = classifyRow(r);
    const prev = b.classBySession.get(r.session_id);
    if (!prev || classPriority[cls] > classPriority[prev]) b.classBySession.set(r.session_id, cls);
    // US flag is sticky: any US row → US session.
    const us = isUsCountry(r.country);
    if (us || !b.usBySession.has(r.session_id)) {
      b.usBySession.set(r.session_id, us || (b.usBySession.get(r.session_id) ?? false));
    }
  }
  return CANONICAL_SOURCES.map((s) => {
    const b = map.get(s)!;
    let external_clean = 0, internal = 0, bot = 0, preview_prefetch = 0, us = 0, non_us = 0;
    for (const sid of b.visitors) {
      const cls = b.classBySession.get(sid) ?? "external_clean";
      if (cls === "external_clean") external_clean++;
      else if (cls === "internal") internal++;
      else if (cls === "bot") bot++;
      else preview_prefetch++;
      if (b.usBySession.get(sid)) us++; else non_us++;
    }
    return {
      source: s, visitors: b.visitors.size, pageviews: b.pageviews,
      external_clean, internal, bot, preview_prefetch, us, non_us,
    };
  });
}

function extractPinId(r: VisitorRow): string | null {
  const hay = `${r.page_path ?? ""}`;
  const m = hay.match(/[?&]pin_id=([^&#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

function landingOf(r: VisitorRow): string {
  const p = (r.page_path ?? "").split("?")[0];
  return p || "/";
}

export type PinterestDrilldown = {
  totals: { visitors: number; pageviews: number; external_clean: number; internal: number; bot: number; preview_prefetch: number; us: number; non_us: number };
  funnel: { product_view: number; add_to_cart: number; begin_checkout: number; purchase: number };
  byCountry: Array<{ country: string; visitors: number }>;
  byPinId: Array<{ pin_id: string; visitors: number }>;
  byCampaign: Array<{ campaign: string; visitors: number }>;
  byLanding: Array<{ path: string; visitors: number }>;
  warnings: string[];
};

export function buildPinterestDrilldown(rows: VisitorRow[]): PinterestDrilldown {
  const pin = rows.filter((r) => canonicalOf(r) === "pinterest");
  const enriched = buildEnrichedBreakdown(pin).find((r) => r.source === "pinterest")!;

  // Funnel — count unique sessions per step (a session that products_view
  // and adds to cart contributes 1 to each).
  const stepSessions: Record<"product_view" | "add_to_cart" | "begin_checkout" | "purchase", Set<string>> = {
    product_view: new Set(), add_to_cart: new Set(), begin_checkout: new Set(), purchase: new Set(),
  };
  for (const r of pin) {
    const t = r.activity_type ?? "";
    if (t === "product_view") stepSessions.product_view.add(r.session_id);
    else if (t === "add_to_cart" || t === "cart" || t === "view_cart") stepSessions.add_to_cart.add(r.session_id);
    else if (t === "begin_checkout" || t === "checkout") stepSessions.begin_checkout.add(r.session_id);
    else if (t === "purchase") stepSessions.purchase.add(r.session_id);
  }

  const bumpUnique = (m: Map<string, Set<string>>, key: string, sid: string) => {
    let s = m.get(key); if (!s) { s = new Set(); m.set(key, s); } s.add(sid);
  };
  const country = new Map<string, Set<string>>();
  const pinId = new Map<string, Set<string>>();
  const campaign = new Map<string, Set<string>>();
  const landing = new Map<string, Set<string>>();
  for (const r of pin) {
    bumpUnique(country, r.country ?? "Onbekend", r.session_id);
    const pid = extractPinId(r); if (pid) bumpUnique(pinId, pid, r.session_id);
    bumpUnique(campaign, r.utm_campaign?.trim() || "(geen)", r.session_id);
    bumpUnique(landing, landingOf(r), r.session_id);
  }
  const toRows = <K extends string>(m: Map<string, Set<string>>, key: K) =>
    [...m.entries()].map(([k, v]) => ({ [key]: k, visitors: v.size } as Record<K, string> & { visitors: number }))
      .sort((a, b) => b.visitors - a.visitors);

  const warnings: string[] = [];
  if (enriched.visitors > 0 && enriched.us === 0)
    warnings.push("Pinterest heeft verkeer maar 0 US-bezoekers — alle clicks zijn buiten doelgroep.");
  if (enriched.visitors > 0 && enriched.external_clean === 0)
    warnings.push("Pinterest verkeer bestaat alleen uit internal/test/bot/preview sessies — niet bruikbaar voor marketing-beslissingen.");
  if (enriched.preview_prefetch > 0 && stepSessions.add_to_cart.size === 0 && stepSessions.purchase.size === 0)
    warnings.push("Pinterest preview/prefetch verkeer zonder enige conversie — Pinterest crawler/prefetcher gedetecteerd.");
  if (enriched.visitors > 0 && enriched.internal / enriched.visitors >= 0.5)
    warnings.push("≥50% van Pinterest verkeer is intern — schakel ‘Exclude internal/test’ uit om dit zichtbaar te krijgen.");

  return {
    totals: {
      visitors: enriched.visitors, pageviews: enriched.pageviews,
      external_clean: enriched.external_clean, internal: enriched.internal,
      bot: enriched.bot, preview_prefetch: enriched.preview_prefetch,
      us: enriched.us, non_us: enriched.non_us,
    },
    funnel: {
      product_view: stepSessions.product_view.size,
      add_to_cart: stepSessions.add_to_cart.size,
      begin_checkout: stepSessions.begin_checkout.size,
      purchase: stepSessions.purchase.size,
    },
    byCountry: toRows(country, "country").slice(0, 10) as Array<{ country: string; visitors: number }>,
    byPinId: toRows(pinId, "pin_id").slice(0, 10) as Array<{ pin_id: string; visitors: number }>,
    byCampaign: toRows(campaign, "campaign").slice(0, 10) as Array<{ campaign: string; visitors: number }>,
    byLanding: toRows(landing, "path").slice(0, 10) as Array<{ path: string; visitors: number }>,
    warnings,
  };
}